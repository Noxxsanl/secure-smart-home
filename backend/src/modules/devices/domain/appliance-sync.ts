// Đồng bộ trạng thái các thiết bị THẬT của một Node từ telemetry của chính Node đó: đèn, quạt (relay), rèm (động cơ bước),
// điều hoà (IR) — devices.appliance = 'lamp' | 'fan' | 'curtain' | 'ac'. Các thiết bị này không tự gửi gì lên backend: chỉ
// Node biết chúng (đang bật? rèm mở? điều hoà đặt bao nhiêu độ?), nên mỗi số đo hợp lệ của Node vừa là bằng chứng "còn
// sống" (last_seen — nếu không lệnh sẽ bị 409 DEVICE_OFFLINE) vừa là nguồn trạng thái (kể cả khi người dùng bấm trên màn
// hình Node, không qua Server).
// Được gọi từ telemetry/domain/ingest-common.ts — dùng chung cho cả ingest HTTP và MQTT (invariant 4).
import { eventBus } from "../../../shared/events/event-bus";
import { isOnline } from "../../../shared/time";
import { toBoolOrNull, type Queryable } from "../../../infrastructure/database/db";
import { listNodeAppliances, touchAppliance } from "../infrastructure/device.repository";
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
}

export async function syncNodeAppliances(nodeDbId: number, report: NodeApplianceReport, db?: Queryable): Promise<void> {
  const rows = await listNodeAppliances(nodeDbId, db);
  for (const row of rows) {
    const isAc = row.appliance === "ac";
    const oldPower = toBoolOrNull(row.power_state);
    const newPower = report.power[row.appliance] ?? oldPower;
    const newSetpoint = isAc && report.acSetpoint !== null ? report.acSetpoint : row.ac_setpoint;
    const newCodes = isAc && report.acCodes !== null ? report.acCodes : row.ac_codes;
    // Chỉ dòng rèm mới nhận curtain_pos từ telemetry
    const newCurtainPos = row.appliance === "curtain" && report.curtainPos !== null ? report.curtainPos : row.curtain_pos;
    const wasOnline = isOnline(row.last_seen);

    await touchAppliance(row.id, newPower, newSetpoint, newCodes, newCurtainPos, db);

    // Chỉ báo UI khi có gì đổi: bật/tắt (rèm: mở/đóng), % mở rèm, nhiệt độ đặt, mã IR đã học, hoặc vừa online trở lại
    if (
      newPower === oldPower &&
      newSetpoint === row.ac_setpoint &&
      newCodes === row.ac_codes &&
      newCurtainPos === row.curtain_pos &&
      wasOnline
    ) {
      continue;
    }
    const updated = await getDeviceRow(row.id, db);
    const event = updated ? toDeviceStateEvent(updated) : null;
    if (event) eventBus.emit("device_state", event);
  }
}
