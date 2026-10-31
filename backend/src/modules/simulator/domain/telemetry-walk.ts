// Random walk nhiệt độ 22–34 °C, độ ẩm 45–85 % cho cảm biến ảo (trạng thái từng cảm biến giữ ở RAM).
import { clamp, randomBetween } from "./random";

const TEMP_RANGE = { min: 22, max: 34, centre: 28 } as const;
const HUMIDITY_RANGE = { min: 45, max: 85, centre: 65 } as const;

const walkState = new Map<number, { temperature: number; humidity: number }>();

export function nextWalk(deviceId: number): { temperature: number; humidity: number } {
  const prev = walkState.get(deviceId) ?? {
    temperature: randomBetween(25, 31),
    humidity: randomBetween(55, 75),
  };
  // Bước ngẫu nhiên + kéo nhẹ về giữa dải để không dính biên
  const temperature = clamp(
    prev.temperature + randomBetween(-0.7, 0.7) + (TEMP_RANGE.centre - prev.temperature) * 0.05,
    TEMP_RANGE.min,
    TEMP_RANGE.max
  );
  const humidity = clamp(
    prev.humidity + randomBetween(-2.5, 2.5) + (HUMIDITY_RANGE.centre - prev.humidity) * 0.05,
    HUMIDITY_RANGE.min,
    HUMIDITY_RANGE.max
  );
  const next = { temperature: Math.round(temperature * 10) / 10, humidity: Math.round(humidity * 10) / 10 };
  walkState.set(deviceId, next);
  return next;
}
