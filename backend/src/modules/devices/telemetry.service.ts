// Hook sau khi một số đo đã được INSERT vào sensor_data (CONTRACT_V2 §6).
//
// Được gọi bởi CẢ HAI đường ingest — services/mqttDataService.ts (MQTT) và routes/data.routes.ts
// (HTTP fallback) — ngay sau INSERT thành công và TRƯỚC khi chúng cập nhật devices.last_seen, vì hook
// cần last_seen CŨ để biết thiết bị vừa "sống lại". Simulator cũng gọi đúng hàm này.
//
// Việc hook làm (không bao giờ ném lỗi — ingest không được hỏng vì hook):
//   1. đánh dấu provision_status 'pending' → 'provisioned' cho sensor/gateway (lần đầu được thấy);
//   2. phát bus `telemetry` (WebSocket hub, automation engine nghe);
//   3. phát bus `device_state` cho sensor/gateway vừa chuyển offline → online (UI cập nhật ngay;
//      audit + thông báo online/offline là việc của device monitor, chạy mỗi 15 s);
//   4. door_contact báo cửa mở → thông báo DOOR_OPENED (warning) cho mọi thành viên của nhà.
import { runSql, placeholders } from "../../lib/db";
import { eventBus } from "../../lib/eventBus";
import { isOnline } from "../../lib/time";
import { notifyHomeMembers } from "../notifications/notification.service";
import { buildReading, listDeviceRowsByIds, toDeviceStateSnapshot } from "./deviceReadModel";
import type { DeviceRow } from "./devices.types";

export interface TelemetryIngestInput {
  /** devices.id của sensor đã xác thực. */
  sensorDbId: number;
  /** devices.id của gateway đã xác thực. */
  gatewayDbId: number;
  /** Payload số đo đã kiểm là object (`{temperature, humidity}` hoặc `{door_open}`…). */
  data: Record<string, unknown>;
  /** Thời điểm nhận (≈ received_at của dòng vừa insert). */
  receivedAt: Date;
}

// Chống thông báo "cửa mở" lặp: chỉ báo ở lần chuyển đóng→mở, và cách lần báo trước ≥ 10 s
// (cảm biến cửa bị rung/báo liên tục). Trạng thái ở RAM — khởi động lại coi như cửa đang đóng.
const DOOR_ALERT_DEBOUNCE_MS = 10_000;
const doorState = new Map<number, { open: boolean; notifiedAt: number }>();

async function markProvisioned(rows: readonly DeviceRow[]): Promise<void> {
  const pendingIds = rows.filter((row) => row.provision_status === "pending").map((row) => row.id);
  if (pendingIds.length === 0) return;
  await runSql(
    `UPDATE devices SET provision_status = 'provisioned'
      WHERE id IN (${placeholders(pendingIds.length)}) AND provision_status = 'pending'`,
    pendingIds
  );
}

function emitCameOnline(row: DeviceRow, receivedAt: Date): void {
  if (row.home_id === null) return;
  // last_seen trong DB chưa được cập nhật lúc hook chạy → dùng thời điểm nhận làm last_seen mới
  eventBus.emit("device_state", {
    home_id: row.home_id,
    device: toDeviceStateSnapshot({ ...row, last_seen: receivedAt }),
  });
}

async function alertDoorOpened(sensor: DeviceRow, homeId: number, open: boolean): Promise<void> {
  const previous = doorState.get(sensor.id);
  const now = Date.now();
  if (!open) {
    doorState.set(sensor.id, { open: false, notifiedAt: previous?.notifiedAt ?? 0 });
    return;
  }
  const shouldAlert = !previous?.open && now - (previous?.notifiedAt ?? 0) > DOOR_ALERT_DEBOUNCE_MS;
  doorState.set(sensor.id, { open: true, notifiedAt: shouldAlert ? now : (previous?.notifiedAt ?? 0) });
  if (!shouldAlert) return;

  const place = sensor.room_name ? ` (${sensor.room_name})` : "";
  await notifyHomeMembers({
    homeId,
    type: "DOOR_OPENED",
    title: "Cửa đang mở",
    message: `${sensor.device_name}${place} vừa báo cửa mở.`,
    severity: "warning",
    relatedDeviceId: sensor.id,
  });
}

export async function onTelemetryIngested(input: TelemetryIngestInput): Promise<void> {
  try {
    const rows = await listDeviceRowsByIds([input.sensorDbId, input.gatewayDbId]);
    const sensor = rows.find((row) => row.id === input.sensorDbId);
    const gateway = rows.find((row) => row.id === input.gatewayDbId);
    if (!sensor) return;

    const nowMs = input.receivedAt.getTime();
    const sensorWasOnline = isOnline(sensor.last_seen, nowMs);
    const gatewayWasOnline = gateway ? isOnline(gateway.last_seen, nowMs) : true;

    await markProvisioned(gateway ? [sensor, gateway] : [sensor]);

    const reading = buildReading(input.data, input.receivedAt);
    if (sensor.home_id !== null) {
      eventBus.emit("telemetry", {
        home_id: sensor.home_id,
        room_id: sensor.room_id,
        device_id: sensor.id,
        reading,
      });
    }
    if (!sensorWasOnline) emitCameOnline(sensor, input.receivedAt);
    if (gateway && !gatewayWasOnline) emitCameOnline(gateway, input.receivedAt);

    if (sensor.category === "door_contact" && sensor.home_id !== null && reading.door_open !== null) {
      await alertDoorOpened(sensor, sensor.home_id, reading.door_open);
    }
  } catch (err) {
    console.error("[telemetry] onTelemetryIngested failed:", err instanceof Error ? err.message : "unknown error");
  }
}
