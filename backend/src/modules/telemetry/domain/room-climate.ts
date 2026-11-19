// Khí hậu phòng tại một thời điểm — facade cho module khác (control ghi nhật ký hành vi cần nhiệt độ/độ ẩm lúc bật/tắt).
import type { Queryable } from "../../../infrastructure/database/db";
import { findRoomClimate } from "../infrastructure/room-climate.read-model";
import type { RoomClimate } from "./telemetry.types";

/** Số đo cũ hơn ngần này so với thời điểm hỏi coi như không còn phản ánh phòng (Node gửi ~1 s/lần, 10 phút là rất rộng). */
export const ROOM_CLIMATE_WINDOW_MS = 10 * 60 * 1000;

/**
 * Giá trị mới nhất của từng chỉ số (temperature, humidity) từ các thiết bị cảm biến CÙNG PHÒNG có received_at trong
 * [at − 10 phút, at]; không có → null. roomId null (thiết bị chưa gán phòng) → cả hai null. Không bao giờ ném lỗi.
 */
export async function getRoomClimate(roomId: number | null, at: Date, db?: Queryable): Promise<RoomClimate> {
  if (roomId === null) return { temperature: null, humidity: null };
  return findRoomClimate(roomId, at, ROOM_CLIMATE_WINDOW_MS, db);
}
