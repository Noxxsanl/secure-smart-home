// Đồng bộ trạng thái các relay THẬT của một Node từ telemetry của chính Node đó (điều hoà IR, devices.appliance = 'ac').
// Điều hoà không tự gửi gì lên backend: chỉ Node phòng khách biết nó (đang bật? đặt bao nhiêu độ?), nên mỗi số đo hợp lệ
// của Node vừa là bằng chứng "còn sống" (last_seen — nếu không lệnh sẽ bị 409 DEVICE_OFFLINE) vừa là nguồn trạng thái.
// Được gọi từ telemetry/domain/ingest-common.ts — dùng chung cho cả ingest HTTP và MQTT (invariant 4).
import { eventBus } from "../../../shared/events/event-bus";
import { isOnline } from "../../../shared/time";
import { toBoolOrNull, type Queryable } from "../../../infrastructure/database/db";
import { listNodeAppliances, touchAppliance } from "../infrastructure/device.repository";
import { getDeviceRow, toDeviceStateEvent } from "../infrastructure/device.read-model";

/** Phần trạng thái điều hoà mà Node báo trong số đo; null = lần này Node không báo (giữ giá trị trong DB). */
export interface NodeApplianceReport {
  acPower: boolean | null;
  acSetpoint: number | null;
  /** Bitmask mã IR đã học (0..65535); null = Node không báo/giá trị sai. */
  acCodes: number | null;
}

export async function syncNodeAppliances(nodeDbId: number, report: NodeApplianceReport, db?: Queryable): Promise<void> {
  const rows = await listNodeAppliances(nodeDbId, db);
  for (const row of rows) {
    const isAc = row.appliance === "ac";
    const oldPower = toBoolOrNull(row.power_state);
    const newPower = isAc && report.acPower !== null ? report.acPower : oldPower;
    const newSetpoint = isAc && report.acSetpoint !== null ? report.acSetpoint : row.ac_setpoint;
    const newCodes = isAc && report.acCodes !== null ? report.acCodes : row.ac_codes;
    const wasOnline = isOnline(row.last_seen);

    await touchAppliance(row.id, newPower, newSetpoint, newCodes, db);

    // Chỉ báo UI khi có gì đổi: bật/tắt, nhiệt độ đặt, mã IR đã học, hoặc vừa online trở lại
    if (newPower === oldPower && newSetpoint === row.ac_setpoint && newCodes === row.ac_codes && wasOnline) continue;
    const updated = await getDeviceRow(row.id, db);
    const event = updated ? toDeviceStateEvent(updated) : null;
    if (event) eventBus.emit("device_state", event);
  }
}
