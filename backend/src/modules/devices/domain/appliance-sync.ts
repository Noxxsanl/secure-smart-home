// Đồng bộ trạng thái các thiết bị THẬT của một Node từ telemetry của chính Node đó: đèn, quạt (relay), rèm (động cơ bước),
// điều hoà (IR) — devices.appliance = 'lamp' | 'fan' | 'curtain' | 'ac'. Các thiết bị này không tự gửi gì lên backend: chỉ
// Node biết chúng (đang bật? rèm mở? điều hoà đặt bao nhiêu độ?), nên mỗi số đo hợp lệ của Node vừa là bằng chứng "còn
// sống" (last_seen — nếu không lệnh sẽ bị 409 DEVICE_OFFLINE) vừa là nguồn trạng thái (kể cả khi người dùng bấm trên màn
// hình Node, không qua Server).
// Được gọi từ telemetry/domain/ingest-common.ts — dùng chung cho cả ingest HTTP và MQTT (invariant 4).
import { eventBus } from "../../../shared/events/event-bus";
import { isOnline } from "../../../shared/time";
import { toBoolOrNull, withTransaction, type Queryable } from "../../../infrastructure/database/db";
import { listNodeAppliances, lockApplianceState, touchAppliance, type NodeApplianceRow } from "../infrastructure/device.repository";
import { getDeviceRow, toDeviceStateEvent } from "../infrastructure/device.read-model";
import type { Appliance } from "./device.types";

/** Phần trạng thái thiết bị mà Node báo trong số đo; null = lần này Node không báo khoá đó (giữ giá trị trong DB). */
export interface NodeApplianceReport {
  /** Bật/tắt theo loại thiết bị (telemetry `lamp`, `fan`, `curtain`, `ac`); rèm: true = đang mở, false = đóng hẳn. */
  power: Record<Appliance, boolean | null>;
  acSetpoint: number | null;
  /** Bitmask mã IR đã học (0..65535); null = Node không báo/giá trị sai. */
  acCodes: number | null;
  /** % mở của rèm: 0 = đóng, 2..100 = %; null = Node không báo hoặc báo "mở chưa rõ %" (giữ curtain_pos trong DB). */
  curtainPos: number | null;
  /** Nhiệt độ/độ ẩm Node (SHT31) báo trong CHÍNH gói này — ngữ cảnh cho nhật ký hành vi; null = gói không có số nào hợp lệ. */
  climate?: { temperature: number | null; humidity: number | null } | null;
}

/** level của nhật ký hành vi: % mở rèm, nhiệt độ đặt điều hoà; đèn/quạt không có. */
function levelOf(appliance: Appliance, curtainPos: number | null, acSetpoint: number | null): number | null {
  return appliance === "curtain" ? curtainPos : appliance === "ac" ? acSetpoint : null;
}

/** Kết quả đồng bộ MỘT thiết bị: sự kiện cần phát sau khi transaction commit (null = không có gì đổi để báo). */
interface ApplianceSyncResult {
  /** Có gì đổi (bật/tắt, % rèm, nhiệt độ đặt, mã IR, vừa online lại) → báo UI qua `device_state`. */
  stateChanged: boolean;
  /** Trạng thái tải đổi thật so với giá trị VỪA KHOÁ → `appliance_changed` cho nhật ký hành vi. */
  applianceChanged: {
    before: { power: boolean | null; level: number | null };
    after: { power: boolean | null; level: number | null };
  } | null;
}

/**
 * Khoá dòng thiết bị → đọc trạng thái cũ → ghi trạng thái mới, trong cùng transaction của `db`. "Cũ" lấy từ giá trị VỪA
 * KHOÁ (không phải `rows` đọc trước đó): dòng devices là trọng tài duy nhất, tuần tự hoá cả hai gói telemetry đồng thời
 * (HTTP + MQTT) lẫn lệnh ack của sendDeviceCommand — mỗi lần đổi trạng thái chỉ một bên thấy "cũ ≠ mới" nên chỉ một bên
 * ghi dòng hành vi (không dòng thừa, không mất dòng).
 */
async function syncOneAppliance(row: NodeApplianceRow, report: NodeApplianceReport, db: Queryable): Promise<ApplianceSyncResult | null> {
  const locked = await lockApplianceState(row.id, db);
  if (!locked) return null; // thiết bị vừa bị xoá giữa lúc liệt kê và lúc khoá
  const isAc = row.appliance === "ac";
  const oldPower = toBoolOrNull(locked.power_state);
  const newPower = report.power[row.appliance] ?? oldPower;
  const newSetpoint = isAc && report.acSetpoint !== null ? report.acSetpoint : locked.ac_setpoint;
  const newCodes = isAc && report.acCodes !== null ? report.acCodes : locked.ac_codes;
  // Chỉ dòng rèm mới nhận curtain_pos từ telemetry
  const newCurtainPos = row.appliance === "curtain" && report.curtainPos !== null ? report.curtainPos : locked.curtain_pos;
  const wasOnline = isOnline(locked.last_seen);

  await touchAppliance(row.id, newPower, newSetpoint, newCodes, newCurtainPos, db);

  // Nhật ký hành vi (user_behavior_logs): MỖI lần trạng thái tải đổi thật → 1 sự kiện, kể cả khi người dùng bấm tại chỗ
  // (màn hình Gateway/Node đi thẳng ESP-NOW, server chỉ thấy qua telemetry này). Chỉ tính bật/tắt, % mở rèm, nhiệt độ
  // đặt — KHÔNG tính ac_codes hay việc vừa online lại. Giá trị cũ NULL = lần đầu server biết trạng thái (vừa đăng ký,
  // DB mới) chứ không phải người dùng thao tác → không phát, kẻo nhật ký có dòng ma.
  const powerChanged = oldPower !== null && newPower !== oldPower;
  const curtainChanged = row.appliance === "curtain" && locked.curtain_pos !== null && newCurtainPos !== locked.curtain_pos;
  const setpointChanged = isAc && locked.ac_setpoint !== null && newSetpoint !== locked.ac_setpoint;
  const applianceChanged =
    powerChanged || curtainChanged || setpointChanged
      ? {
          before: { power: oldPower, level: levelOf(row.appliance, locked.curtain_pos, locked.ac_setpoint) },
          after: { power: newPower, level: levelOf(row.appliance, newCurtainPos, newSetpoint) },
        }
      : null;

  // Chỉ báo UI khi có gì đổi: bật/tắt (rèm: mở/đóng), % mở rèm, nhiệt độ đặt, mã IR đã học, hoặc vừa online trở lại
  const stateChanged =
    newPower !== oldPower ||
    newSetpoint !== locked.ac_setpoint ||
    newCodes !== locked.ac_codes ||
    newCurtainPos !== locked.curtain_pos ||
    !wasOnline;
  return { stateChanged, applianceChanged };
}

/**
 * Đồng bộ từng thiết bị của Node, mỗi thiết bị một transaction ngắn (khoá dòng → đọc cũ → ghi mới). Sự kiện bus phát SAU
 * khi commit để listener (record-behavior đọc device_commands, WebSocket đọc lại dòng thiết bị) luôn thấy dữ liệu đã chốt.
 * Cố ý KHÔNG nhận `db` từ người gọi: truyền pool thì `FOR UPDATE` nhả khoá ngay (mất trọng tài), truyền transaction ngoài
 * thì sự kiện phát trước khi commit — transaction luôn do hàm này tự mở.
 */
export async function syncNodeAppliances(nodeDbId: number, report: NodeApplianceReport): Promise<void> {
  // Danh sách thiết bị + thông tin tĩnh (nhà, phòng, loại); trạng thái động lấy lại từ dòng đã khoá trong syncOneAppliance
  const rows = await listNodeAppliances(nodeDbId);
  // Thời điểm server nhận gói (dùng cho appliance_changed) — chung cho mọi thiết bị của Node trong lần này
  const receivedAt = new Date().toISOString();
  for (const row of rows) {
    const result = await withTransaction((conn) => syncOneAppliance(row, report, conn));
    if (!result) continue;

    if (result.applianceChanged) {
      eventBus.emit("appliance_changed", {
        device_id: row.id,
        home_id: row.home_id,
        room_id: row.room_id,
        appliance: row.appliance,
        is_simulated: false, // listNodeAppliances chỉ lấy thiết bị thật
        before: result.applianceChanged.before,
        after: result.applianceChanged.after,
        at: receivedAt,
        climate: report.climate ?? null,
      });
    }
    if (result.stateChanged) {
      const updated = await getDeviceRow(row.id);
      const event = updated ? toDeviceStateEvent(updated) : null;
      if (event) eventBus.emit("device_state", event);
    }
  }
}
