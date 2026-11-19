// Presence monitor (CONTRACT_V2 §6, FR-8.1, NFR-R1): phát hiện thiết bị chuyển online/offline.
//
// Mỗi 15 s đọc last_seen của mọi thiết bị, tính tập online (cửa sổ ONLINE_WINDOW_SECONDS = 90 s) và so với
// lần trước. Với thiết bị đã gán nhà mà đổi trạng thái:
//   - bus `device_state` (WebSocket → mobile cập nhật ngay),
//   - audit DEVICE_ONLINE/OFFLINE hoặc GATEWAY_ONLINE/OFFLINE (Log Center),
//   - thông báo cho mọi thành viên hiệu lực (offline: warning, gateway offline: critical, online lại: success),
//   - GATEWAY_OFFLINE: thêm thông báo cho nhân viên (target "all").
// Tick ĐẦU sau khởi động chỉ nạp trạng thái — nếu không, mỗi lần restart backend sẽ báo "offline" hàng loạt.
// Cache online (domain/online-cache.ts: isOnlineFromCache/getOnlineDeviceIds) cũng được nạp ở đây.
import { eventBus } from "../../../../shared/events/event-bus";
import { isOnline } from "../../../../shared/time";
import { logEvent } from "../../../audit";
import { notifyHomeMembers, notifyStaff } from "../../../notifications";
import { setOnlineDeviceIds } from "../../domain/online-cache";
import type { DeviceRow } from "../../domain/device.types";
import { listDeviceLastSeen } from "../../infrastructure/device.repository";
import { listDeviceRowsByIds, toDeviceStateEvent } from "../../infrastructure/device.read-model";

const TICK_INTERVAL_MS = 15_000;

/** Trạng thái online lần tick trước; rỗng cho tới khi tick đầu nạp xong. */
const previousState = new Map<number, boolean>();
let seeded = false;
let running = false;
let started = false;

function placeLabel(row: DeviceRow): string {
  return row.room_name ? ` (${row.room_name})` : "";
}

async function announceTransition(row: DeviceRow, nowOnline: boolean, skipNotification: boolean): Promise<void> {
  const homeId = row.home_id;
  if (homeId === null) return;

  const event = toDeviceStateEvent({ ...row });
  if (event) eventBus.emit("device_state", event);

  const isGateway = row.device_type === "gateway";
  const eventType = `${isGateway ? "GATEWAY" : "DEVICE"}_${nowOnline ? "ONLINE" : "OFFLINE"}`;
  const subject = isGateway ? `Gateway ${row.device_id}` : `Thiết bị "${row.device_name}"`;
  await logEvent({
    eventType,
    homeId,
    deviceId: row.id,
    message: `${subject} ${nowOnline ? "đã kết nối lại" : "mất kết nối"}`,
    details: { device_uid: row.device_id, category: row.category },
  });

  // Chỉ thông báo cho thiết bị đang active; thiết bị bị chặn/vô hiệu hoá offline là chuyện bình thường
  if (skipNotification || row.status !== "active") return;

  if (isGateway) {
    await notifyHomeMembers({
      homeId,
      type: eventType,
      title: nowOnline ? "Gateway đã kết nối lại" : "Gateway mất kết nối",
      message: nowOnline
        ? `Gateway của nhà "${row.home_name ?? ""}" đã hoạt động trở lại.`
        : `Gateway của nhà "${row.home_name ?? ""}" đã mất kết nối. Các thiết bị sẽ không điều khiển được cho tới khi kết nối lại.`,
      severity: nowOnline ? "success" : "critical",
      relatedDeviceId: row.id,
    });
    if (!nowOnline) {
      await notifyStaff({
        targetRole: "all",
        type: eventType,
        title: "Gateway mất kết nối",
        message: `Gateway ${row.device_id} của nhà "${row.home_name ?? ""}" đã mất kết nối.`,
        severity: "critical",
        homeId,
        relatedDeviceId: row.id,
      });
    }
    return;
  }

  await notifyHomeMembers({
    homeId,
    type: eventType,
    title: nowOnline ? "Thiết bị đã kết nối lại" : "Thiết bị mất kết nối",
    message: nowOnline
      ? `${row.device_name}${placeLabel(row)} đã hoạt động trở lại.`
      : `${row.device_name}${placeLabel(row)} đã mất kết nối.`,
    severity: nowOnline ? "success" : "warning",
    relatedDeviceId: row.id,
  });
}

async function tick(): Promise<void> {
  if (running) return; // tick trước chưa xong (DB chậm) → bỏ lượt, không chồng chéo
  running = true;
  try {
    const rows = await listDeviceLastSeen();
    const nowMs = Date.now();
    const current = new Map<number, boolean>();
    for (const row of rows) current.set(row.id, isOnline(row.last_seen, nowMs));

    setOnlineDeviceIds([...current].filter(([, online]) => online).map(([id]) => id));

    const changedIds: number[] = [];
    if (seeded) {
      for (const [id, online] of current) {
        const before = previousState.get(id);
        if (before !== undefined && before !== online) changedIds.push(id);
      }
    }

    previousState.clear();
    for (const [id, online] of current) previousState.set(id, online);
    seeded = true;

    if (changedIds.length === 0) return;
    const changedRows = (await listDeviceRowsByIds(changedIds)).filter((row) => row.home_id !== null);

    // Gateway chuyển offline trong cùng tick → các node của nó offline theo, chỉ cần MỘT thông báo
    // (gateway critical) thay vì một loạt thông báo thiết bị. Audit + bus vẫn ghi đủ.
    const gatewayChanged = new Map<number, boolean>();
    for (const row of changedRows) {
      if (row.device_type === "gateway") gatewayChanged.set(row.id, current.get(row.id) ?? false);
    }

    for (const row of changedRows) {
      try {
        const nowOnline = current.get(row.id) ?? false;
        const follows = row.gateway_device_id !== null && gatewayChanged.get(row.gateway_device_id) === nowOnline;
        await announceTransition(row, nowOnline, follows);
      } catch (err) {
        console.error("[deviceMonitor] announce failed:", err instanceof Error ? err.message : "unknown error");
      }
    }
  } catch (err) {
    console.error("[deviceMonitor] tick failed:", err instanceof Error ? err.message : "unknown error");
  } finally {
    running = false;
  }
}

export function startDeviceMonitor(): void {
  if (started) return;
  started = true;
  void tick(); // tick đầu: chỉ nạp trạng thái
  const timer = setInterval(() => void tick(), TICK_INTERVAL_MS);
  timer.unref();
}
