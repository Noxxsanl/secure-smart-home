// Đường 2 của nhật ký hành vi: trạng thái tải (đèn/quạt/rèm/điều hoà) của Node đổi, server thấy qua telemetry
// (devices/domain/appliance-sync phát `appliance_changed`). Có hai trường hợp:
//   (a) người dùng bấm TẠI CHỖ trên màn hình Gateway/Node hoặc remote — lệnh đi thẳng ESP-NOW, server không có
//       device_commands nào → source 'local', user_id NULL;
//   (b) telemetry về sát lúc ack của lệnh từ server (web/mobile/hẹn giờ/automation/AI) — tìm lệnh khớp trong
//       device_commands (cửa sổ hẹp theo trạng thái lệnh) để gán đúng nguồn + người ra lệnh + device_command_id.
// Chống dòng thừa/mất dòng: dòng `devices` là trọng tài duy nhất. appliance-sync (đường này) và send-device-command (đường 1,
// sau ack) đều KHOÁ dòng devices rồi mới đọc "trạng thái trước" + ghi "trạng thái mới" trong cùng transaction, nên với mỗi lần
// đổi trạng thái chỉ bên thật sự làm đổi mới thấy cũ ≠ mới và ghi dòng. Telemetry đổi trước → đường 1 thấy before == after,
// không ghi, và dòng ở đây được gán cho lệnh (lệnh chưa có log). Đường 1 đổi trước → telemetry không thấy thay đổi, không
// phát sự kiện. Unique index device_command_id + ON CONFLICT DO NOTHING chỉ còn là lưới an toàn.
// Hạn chế đã biết: đường này không biết `behaviorSource` ghi đè của automation (rule sinh từ gợi ý AI = 'ai_suggested'),
// nên dòng do telemetry ghi trước sẽ mang 'automation'. Nhiệt độ/độ ẩm: ưu tiên số đo trong chính gói telemetry, thiếu
// thì lấy số đo mới nhất ≤ 10 phút của cảm biến cùng phòng.
import { eventBus } from "../../../../shared/events/event-bus";
import type { ApplianceChange } from "../../../../shared/events/event-payloads";
import { getDeviceRow } from "../../../devices";
import { getRoomClimate } from "../../../telemetry";
import { behaviorSourceOf, commandExplainsChange, deriveBehaviorAction, powerLabel } from "../../domain/behavior-derive";
import { recordBehavior } from "../../infrastructure/behavior-log.repository";
import { listRecentUnloggedCommands } from "../../infrastructure/device-command.repository";

async function handleApplianceChanged(event: ApplianceChange): Promise<void> {
  const action = deriveBehaviorAction(event.appliance, event.before, event.after);
  if (action === null) return;

  const at = new Date(event.at);
  if (Number.isNaN(at.getTime())) return;
  // device_type (= devices.category) + múi giờ nhà để tính weekday/minute_of_day đúng giờ địa phương
  const device = await getDeviceRow(event.device_id);
  if (!device) return;

  // Cửa sổ gán nguồn đã thu hẹp theo trạng thái lệnh (xem listRecentUnloggedCommands)
  const commands = await listRecentUnloggedCommands(event.device_id, at);
  const command = commands.find((c) => commandExplainsChange(c.command, action, event.after)) ?? null;

  let temperature = event.climate?.temperature ?? null;
  let humidity = event.climate?.humidity ?? null;
  if (temperature === null || humidity === null) {
    const room = await getRoomClimate(event.room_id, at);
    temperature = temperature ?? room.temperature;
    humidity = humidity ?? room.humidity;
  }

  await recordBehavior({
    homeId: event.home_id,
    timezone: device.home_timezone ?? "Asia/Ho_Chi_Minh",
    userId: command?.issued_by ?? null,
    roomId: event.room_id,
    deviceId: event.device_id,
    deviceCategory: device.category,
    appliance: event.appliance,
    action,
    previousState: powerLabel(event.before.power),
    newState: powerLabel(event.after.power),
    levelBefore: event.before.level,
    levelAfter: event.after.level,
    temperature,
    humidity,
    deviceCommandId: command?.id ?? null,
    isSimulated: event.is_simulated,
    source: command ? behaviorSourceOf(command.source, command.channel) : "local",
    at,
  });
}

let started = false;

/** Worker `behaviorRecorder`: đăng ký 1 lần listener `appliance_changed`. Listener lỗi đã được eventBus bọc, không làm sập tiến trình. */
export function startBehaviorRecorder(): void {
  if (started) return;
  started = true;
  eventBus.on("appliance_changed", (event) => handleApplianceChanged(event));
}
