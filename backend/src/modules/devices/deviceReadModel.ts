// Read model của thiết bị: MỘT câu SELECT join home/room/gateway (DEVICE_SELECT_SQL), các hàm
// mapper DeviceRow → DTO (customer / console / gateway) và truy vấn số đo (latestReadings,
// getTelemetrySeries). Customer API (BE-B) và Dashboard API (BE-C) dùng chung để hai bên
// không bao giờ lệch định nghĩa "online", "power", "latest".
//
// secret_key KHÔNG nằm trong SELECT này (invariant 1) — chỉ hmacService và việc ký lệnh
// trong deviceCommand.service được đọc cột đó.
import pool from "../../config/db";
import {
  placeholders,
  queryOne,
  queryRows,
  toBool,
  toBoolOrNull,
  toCount,
  toIso,
  toIsoRequired,
  toNumberOrNull,
  type Queryable,
} from "../../lib/db";
import { ONLINE_WINDOW_SECONDS, isOnline } from "../../lib/time";
import type { DeviceStateEvent } from "../../lib/eventBus";
import type {
  ConsoleDevice,
  CustomerDevice,
  DeviceRow,
  DeviceStateSnapshot,
  Gateway,
  GatewayCounts,
  Reading,
  TelemetryRange,
  TelemetrySeries,
} from "./devices.types";

// Giữ import/export cho người dùng module này: một chỗ duy nhất để lấy hằng online.
export { ONLINE_WINDOW_SECONDS, isOnline };

// ── Truy vấn row ───────────────────────────────────────────────────────────

/**
 * SELECT chuẩn cho DeviceRow. Nối thêm `WHERE …`/`ORDER BY …` khi dùng:
 *   queryRows<DeviceRow>(`${DEVICE_SELECT_SQL} WHERE d.home_id = ?`, [homeId])
 * Alias cố định: d = devices, h = smart_homes, r = rooms, gw = gateway của node.
 */
export const DEVICE_SELECT_SQL = `
  SELECT d.id, d.device_id, d.device_name, d.device_type, d.category, d.status, d.location,
         d.fail_count, d.last_seen, d.last_ip, d.created_at,
         d.home_id, d.room_id, d.gateway_device_id, d.node_uid, d.power_state,
         d.firmware_version, d.rssi, d.wifi_ssid, d.provision_status, d.is_simulated, d.sim_online,
         h.name AS home_name, h.status AS home_status, h.timezone AS home_timezone,
         r.name AS room_name, gw.device_id AS gateway_uid
    FROM devices d
    LEFT JOIN smart_homes h ON h.id = d.home_id
    LEFT JOIN rooms r ON r.id = d.room_id
    LEFT JOIN devices gw ON gw.id = d.gateway_device_id`;

export async function getDeviceRow(id: number, db: Queryable = pool): Promise<DeviceRow | null> {
  return queryOne<DeviceRow>(`${DEVICE_SELECT_SQL} WHERE d.id = ?`, [id], db);
}

export async function getDeviceRowByUid(deviceUid: string, db: Queryable = pool): Promise<DeviceRow | null> {
  return queryOne<DeviceRow>(`${DEVICE_SELECT_SQL} WHERE d.device_id = ?`, [deviceUid], db);
}

export async function listDeviceRowsByIds(ids: readonly number[], db: Queryable = pool): Promise<DeviceRow[]> {
  if (ids.length === 0) return [];
  return queryRows<DeviceRow>(`${DEVICE_SELECT_SQL} WHERE d.id IN (${placeholders(ids.length)}) ORDER BY d.id`, [...ids], db);
}

/** Mọi thiết bị của một nhà; gateway đứng đầu, rồi theo thứ tự phòng. */
export async function listHomeDeviceRows(
  homeId: number,
  opts: { includeGateway?: boolean } = {},
  db: Queryable = pool
): Promise<DeviceRow[]> {
  const gatewayFilter = opts.includeGateway === false ? "AND d.device_type <> 'gateway'" : "";
  return queryRows<DeviceRow>(
    `${DEVICE_SELECT_SQL} WHERE d.home_id = ? ${gatewayFilter}
      ORDER BY (d.device_type = 'gateway') DESC, r.sort_order NULLS FIRST, d.room_id NULLS FIRST, d.id`,
    [homeId],
    db
  );
}

// ── Số đo (sensor_data) ────────────────────────────────────────────────────

function asNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return null;
}

/** Cột JSONB do pg trả sẵn là object, nhưng vẫn chịu được chuỗi/Buffer. */
function parsePayload(value: unknown): Record<string, unknown> | null {
  let parsed: unknown = value;
  if (Buffer.isBuffer(parsed)) parsed = parsed.toString("utf8");
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
}

/** Payload cảm biến (`{temperature, humidity, door_open}`) → Reading. Khoá thiếu/sai kiểu → null. */
export function buildReading(data: Record<string, unknown>, receivedAt: Date): Reading {
  return {
    temperature: asNumber(data.temperature),
    humidity: asNumber(data.humidity),
    door_open: asBoolean(data.door_open),
    received_at: toIsoRequired(receivedAt),
  };
}

/**
 * Số đo MỚI NHẤT của từng thiết bị (theo received_at). Thiết bị chưa có số đo vắng mặt trong Map.
 * Dùng truy vấn con tương quan `ORDER BY received_at DESC LIMIT 1` để đi theo index
 * (device_id, received_at) — O(1) mỗi thiết bị thay vì quét cả 8 ngày dữ liệu.
 */
export async function latestReadings(deviceIds: readonly number[], db: Queryable = pool): Promise<Map<number, Reading>> {
  const result = new Map<number, Reading>();
  if (deviceIds.length === 0) return result;
  const rows = await queryRows<{ device_id: number; payload: unknown; received_at: Date }>(
    `SELECT sd.device_id, sd.payload, sd.received_at
       FROM devices d
       JOIN sensor_data sd ON sd.id = (
         SELECT s2.id FROM sensor_data s2 WHERE s2.device_id = d.id ORDER BY s2.received_at DESC LIMIT 1
       )
      WHERE d.id IN (${placeholders(deviceIds.length)})`,
    [...deviceIds],
    db
  );
  for (const row of rows) {
    const payload = parsePayload(row.payload);
    if (payload) result.set(row.device_id, buildReading(payload, row.received_at));
  }
  return result;
}

const BUCKET_SECONDS: Record<TelemetryRange, number> = { "24h": 300, "7d": 3600 };
const RANGE_MS: Record<TelemetryRange, number> = { "24h": 24 * 3600 * 1000, "7d": 7 * 24 * 3600 * 1000 };

// Chỉ nhận số thật trong JSON: `{"temperature": null}` hay chuỗi không được tính là 0 vào AVG.
// `key` chỉ nhận đúng hai literal của kiểu union (không phải input người dùng) nên nối thẳng vào SQL an toàn.
// Làm tròn 2 chữ số bằng ROUND thay vì ép NUMERIC(8,2): số lớn bất thường trong payload không làm cả truy vấn
// lỗi "numeric field overflow".
function jsonNumberSql(key: "temperature" | "humidity"): string {
  const path = `payload->'${key}'`;
  return `CASE WHEN jsonb_typeof(${path}) = 'number' THEN ROUND((payload->>'${key}')::numeric, 2) ELSE NULL END`;
}

/**
 * Chuỗi thời gian nhiệt độ/độ ẩm: AVG theo bucket 300 s (24h) hoặc 3600 s (7d), cũ → mới.
 * Bucket không có số đo nào bị bỏ; thiết bị không phải cảm biến khí hậu → `points` rỗng.
 * Hằng số bucket được nối thẳng vào SQL (không phải input người dùng) để GROUP BY gom đúng một biểu thức.
 */
export async function getTelemetrySeries(deviceId: number, range: TelemetryRange, db: Queryable = pool): Promise<TelemetrySeries> {
  const bucket = BUCKET_SECONDS[range];
  const since = new Date(Date.now() - RANGE_MS[range]);
  const rows = await queryRows<{ bucket_ts: string | number; temperature: string | number | null; humidity: string | number | null }>(
    `SELECT (FLOOR(EXTRACT(EPOCH FROM received_at) / ${bucket}) * ${bucket})::bigint AS bucket_ts,
            AVG(${jsonNumberSql("temperature")}) AS temperature,
            AVG(${jsonNumberSql("humidity")}) AS humidity
       FROM sensor_data
      WHERE device_id = ? AND received_at >= ?
      GROUP BY 1
     HAVING AVG(${jsonNumberSql("temperature")}) IS NOT NULL OR AVG(${jsonNumberSql("humidity")}) IS NOT NULL
      ORDER BY 1 ASC`,
    [deviceId, since],
    db
  );
  const round2 = (value: number | null): number | null => (value === null ? null : Math.round(value * 100) / 100);
  const latest = (await latestReadings([deviceId], db)).get(deviceId) ?? null;
  return {
    device_id: deviceId,
    range,
    bucket_seconds: bucket,
    points: rows.map((row) => ({
      t: new Date(Number(row.bucket_ts) * 1000).toISOString(),
      temperature: round2(toNumberOrNull(row.temperature)),
      humidity: round2(toNumberOrNull(row.humidity)),
    })),
    latest,
  };
}

// ── Số liệu gateway ────────────────────────────────────────────────────────

/** node_count / paired_count / device_count cho nhiều gateway một lượt (gateway không có node → 0). */
export async function getGatewayCounts(gatewayIds: readonly number[], db: Queryable = pool): Promise<Map<number, GatewayCounts>> {
  const result = new Map<number, GatewayCounts>();
  for (const id of gatewayIds) result.set(id, { node_count: 0, paired_count: 0, device_count: 0 });
  if (gatewayIds.length === 0) return result;
  const rows = await queryRows<{ gateway_id: number; node_count: unknown; paired_count: unknown; device_count: unknown }>(
    `SELECT gateway_device_id AS gateway_id,
            COUNT(DISTINCT node_uid) AS node_count,
            COUNT(DISTINCT CASE WHEN last_seen IS NOT NULL THEN node_uid END) AS paired_count,
            COUNT(*) AS device_count
       FROM devices
      WHERE gateway_device_id IN (${placeholders(gatewayIds.length)})
      GROUP BY gateway_device_id`,
    [...gatewayIds],
    db
  );
  for (const row of rows) {
    result.set(row.gateway_id, {
      node_count: toCount(row.node_count),
      paired_count: toCount(row.paired_count),
      device_count: toCount(row.device_count),
    });
  }
  return result;
}

// ── Mapper DTO ─────────────────────────────────────────────────────────────

function relayPower(row: DeviceRow): boolean | null {
  return row.category === "relay" ? toBoolOrNull(row.power_state) : null;
}

/**
 * DeviceRow → CustomerDevice. `canControl` do người gọi tính theo vai trò trong nhà (xem
 * canControlDevice trong modules/access); mapper chỉ AND thêm điều kiện category === 'relay'.
 * Thiết bị chưa gán nhà không bao giờ xuất hiện ở phía khách → ném lỗi lập trình nếu gặp.
 */
export function toCustomerDevice(row: DeviceRow, opts: { canControl: boolean; latest: Reading | null }): CustomerDevice {
  if (row.home_id === null) throw new Error("toCustomerDevice: device is not assigned to a home");
  return {
    id: row.id,
    device_uid: row.device_id,
    device_name: row.device_name,
    category: row.category,
    home_id: row.home_id,
    room_id: row.room_id,
    room_name: row.room_name,
    status: row.status,
    online: isOnline(row.last_seen),
    last_seen: toIso(row.last_seen),
    power: relayPower(row),
    latest: opts.latest,
    can_control: opts.canControl && row.category === "relay",
  };
}

export function toConsoleDevice(row: DeviceRow): ConsoleDevice {
  return {
    id: row.id,
    device_uid: row.device_id,
    device_name: row.device_name,
    device_type: row.device_type,
    category: row.category,
    status: row.status,
    online: isOnline(row.last_seen),
    last_seen: toIso(row.last_seen),
    last_ip: row.last_ip,
    fail_count: row.fail_count,
    home_id: row.home_id,
    home_name: row.home_name,
    room_id: row.room_id,
    room_name: row.room_name,
    gateway_id: row.gateway_device_id,
    gateway_uid: row.gateway_uid,
    node_uid: row.node_uid,
    power: relayPower(row),
    firmware_version: row.firmware_version,
    is_simulated: toBool(row.is_simulated),
    sim_online: toBool(row.sim_online),
    location: row.location,
    created_at: toIsoRequired(row.created_at),
  };
}

/** DeviceRow của một gateway + số liệu node (getGatewayCounts) → Gateway DTO. */
export function toGateway(row: DeviceRow, counts: GatewayCounts): Gateway {
  const online = isOnline(row.last_seen);
  return {
    id: row.id,
    uid: row.device_id,
    home_id: row.home_id,
    home_name: row.home_name,
    status: online ? "online" : "offline",
    device_status: row.status,
    firmware_version: row.firmware_version,
    wifi_ssid: row.wifi_ssid,
    rssi: row.rssi,
    mqtt_status: online ? "connected" : "disconnected",
    last_seen: toIso(row.last_seen),
    last_ip: row.last_ip,
    provision_status: row.provision_status,
    node_count: counts.node_count,
    paired_count: counts.paired_count,
    device_count: counts.device_count,
    is_simulated: toBool(row.is_simulated),
    created_at: toIsoRequired(row.created_at),
  };
}

/** Trạng thái rút gọn cho bus/WebSocket `device_state`. */
export function toDeviceStateSnapshot(row: DeviceRow): DeviceStateSnapshot {
  return {
    id: row.id,
    room_id: row.room_id,
    online: isOnline(row.last_seen),
    last_seen: toIso(row.last_seen),
    power: relayPower(row),
    status: row.status,
  };
}

/** Payload sự kiện bus `device_state`; null khi thiết bị chưa gán nhà (không ai để báo). */
export function toDeviceStateEvent(row: DeviceRow): DeviceStateEvent | null {
  if (row.home_id === null) return null;
  return { home_id: row.home_id, device: toDeviceStateSnapshot(row) };
}
