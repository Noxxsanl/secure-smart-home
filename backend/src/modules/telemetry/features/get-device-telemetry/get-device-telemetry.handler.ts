// Chuỗi số đo của một thiết bị (CONTRACT §4.2 khách, §5 Devices console). Cùng use case trên hai kênh:
//   - khách: requireDeviceAccess "view" (404/403, GUEST chỉ thiết bị được cấp);
//   - console: ADMIN/OPERATOR, Operator trên nhà đã claim cần grant còn hạn + ghi audit "đã xem số liệu" (FR-9.6).
import type { RequestMeta } from "../../../../core/http/request-meta";
import type { AuthContext } from "../../../../core/auth/auth-context";
import type { Reading } from "../../../../shared/events/event-payloads";
import { auditOperatorHomeViewed } from "../../../homes";
import { ensureHomeAccess, latestReadings, requireDevice, requireDeviceAccess } from "../../../devices";
import { BUCKET_SECONDS } from "../../domain/telemetry-range";
import type { TelemetryRange, TelemetrySeries } from "../../domain/telemetry.types";
import { getTelemetrySeries } from "../../infrastructure/telemetry-series.repository";

export async function getDeviceTelemetry(auth: AuthContext, deviceId: number, range: TelemetryRange): Promise<TelemetrySeries> {
  const { device } = await requireDeviceAccess(auth, deviceId, "view");
  if (device.category === "sensor") return getTelemetrySeries(device.id, range);

  // Thiết bị khác không có chuỗi nhiệt/ẩm; cảm biến cửa vẫn trả số đo mới nhất (door_open)
  let latest: Reading | null = null;
  if (device.category === "door_contact") latest = (await latestReadings([device.id])).get(device.id) ?? null;
  return { device_id: device.id, range, bucket_seconds: BUCKET_SECONDS[range], points: [], latest };
}

export async function getConsoleDeviceTelemetry(
  auth: AuthContext,
  id: number,
  range: TelemetryRange,
  meta: RequestMeta
): Promise<TelemetrySeries> {
  const row = await requireDevice(id);
  const access = await ensureHomeAccess(auth, { id: row.home_id, status: row.home_status });
  if (row.home_id !== null && row.home_name !== null) {
    await auditOperatorHomeViewed(auth, { id: row.home_id, name: row.home_name }, access.grant, "số liệu thiết bị", meta);
  }
  return getTelemetrySeries(id, range);
}
