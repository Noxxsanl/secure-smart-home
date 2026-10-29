// SQL của domain nhà/phòng: đọc HomeRow/RoomRow, RoomSummary (kèm khí hậu), và các INSERT dùng
// bởi provisioning (createKitHome). Hàm nhận `db` tuỳ chọn (mặc định pool) để chạy được cả bên
// trong transaction của người gọi.
import pool from "../../config/db";
import { placeholders, queryOne, queryRows, runSql, toCount, type Queryable, type SqlParam } from "../../lib/db";
import { ONLINE_WINDOW_SECONDS } from "../../lib/time";
import type { DeviceCategory, PackageCode } from "../../types/domain";
import { latestReadings } from "../devices/deviceReadModel";
import type { HomeRow, RoomRow, RoomSummary } from "./homes.types";

/**
 * SELECT chuẩn cho HomeRow (alias h = smart_homes, oc = customer chủ nhà). Nối thêm
 * `WHERE …` khi dùng: queryRows<HomeRow>(`${HOME_SELECT_SQL} WHERE h.status = ?`, [...]).
 */
export const HOME_SELECT_SQL = `
  SELECT h.id, h.name, h.package_code, h.address, h.expected_owner_name, h.timezone, h.status,
         h.owner_user_id, h.created_by, h.claimed_at, h.created_at, h.updated_at,
         oc.id AS owner_customer_id,
         (SELECT g.id FROM devices g WHERE g.home_id = h.id AND g.device_type = 'gateway' ORDER BY g.id LIMIT 1) AS gateway_id
    FROM smart_homes h
    LEFT JOIN customers oc ON oc.user_id = h.owner_user_id`;

export async function getHomeRow(id: number, db: Queryable = pool): Promise<HomeRow | null> {
  return queryOne<HomeRow>(`${HOME_SELECT_SQL} WHERE h.id = ?`, [id], db);
}

export async function getRoomRow(id: number, db: Queryable = pool): Promise<RoomRow | null> {
  return queryOne<RoomRow>(
    "SELECT id, home_id, name, room_type, sort_order, created_at, updated_at FROM rooms WHERE id = ?",
    [id],
    db
  );
}

// ── RoomSummary ────────────────────────────────────────────────────────────

export interface RoomSummaryOptions {
  /** false → temperature/humidity = null (Operator chưa có grant — FR-9.6). */
  withClimate: boolean;
  /** Chỉ lấy một phòng. */
  roomId?: number;
  /**
   * Chỉ đếm/đo các thiết bị này (GUEST chỉ thấy thiết bị được phép). undefined/null = mọi thiết bị
   * không phải gateway. Mảng rỗng = không thiết bị nào.
   */
  deviceIds?: readonly number[] | null;
}

interface RoomSummaryRow {
  id: number;
  home_id: number;
  name: string;
  room_type: string;
  sort_order: number;
  device_count: unknown;
  online_count: unknown;
  on_count: unknown;
}

interface ClimateAccumulator {
  temperature: number | null;
  temperatureAt: string | null;
  humidity: number | null;
  humidityAt: string | null;
}

/**
 * Danh sách RoomSummary của một nhà, theo sort_order. Bộ đếm KHÔNG tính gateway; "online" theo
 * ONLINE_WINDOW_SECONDS; `on_count` = số relay đang bật. Nhiệt độ/độ ẩm lấy từ số đo MỚI NHẤT của
 * các cảm biến trong phòng (mỗi chỉ số lấy từ số đo mới nhất có giá trị).
 */
export async function listRoomSummaries(
  homeId: number,
  opts: RoomSummaryOptions,
  db: Queryable = pool
): Promise<RoomSummary[]> {
  const ids = opts.deviceIds ?? null;
  const deviceFilter = ids === null ? "" : ids.length > 0 ? `AND d.id IN (${placeholders(ids.length)})` : "AND 1 = 0";
  const idParams: SqlParam[] = ids === null ? [] : [...ids];

  // Thứ tự tham số khớp thứ tự dấu ? trong câu SQL: truy vấn con (home, ids…) rồi WHERE ngoài.
  const params: SqlParam[] = [homeId, ...idParams, homeId];
  let roomFilter = "";
  if (opts.roomId !== undefined) {
    roomFilter = "AND r.id = ?";
    params.push(opts.roomId);
  }

  const rooms = await queryRows<RoomSummaryRow>(
    `SELECT r.id, r.home_id, r.name, r.room_type, r.sort_order,
            COALESCE(s.device_count, 0) AS device_count,
            COALESCE(s.online_count, 0) AS online_count,
            COALESCE(s.on_count, 0) AS on_count
       FROM rooms r
       LEFT JOIN (
         SELECT d.room_id,
                COUNT(*) AS device_count,
                COUNT(*) FILTER (WHERE d.last_seen IS NOT NULL AND d.last_seen > NOW() - make_interval(secs => ${ONLINE_WINDOW_SECONDS})) AS online_count,
                COUNT(*) FILTER (WHERE d.category = 'relay' AND d.power_state = TRUE) AS on_count
           FROM devices d
          WHERE d.home_id = ? AND d.device_type <> 'gateway' ${deviceFilter}
          GROUP BY d.room_id
       ) s ON s.room_id = r.id
      WHERE r.home_id = ? ${roomFilter}
      ORDER BY r.sort_order, r.id`,
    params,
    db
  );

  const climate = new Map<number, ClimateAccumulator>();
  if (opts.withClimate && rooms.length > 0) {
    const sensors = await queryRows<{ id: number; room_id: number }>(
      `SELECT d.id, d.room_id FROM devices d
        WHERE d.home_id = ? AND d.room_id IS NOT NULL AND d.category = 'sensor' ${deviceFilter}`,
      [homeId, ...idParams],
      db
    );
    const readings = await latestReadings(sensors.map((sensor) => sensor.id), db);
    for (const sensor of sensors) {
      const reading = readings.get(sensor.id);
      if (!reading) continue;
      const acc = climate.get(sensor.room_id) ?? { temperature: null, temperatureAt: null, humidity: null, humidityAt: null };
      // ISO-8601 UTC cùng định dạng nên so sánh chuỗi đúng thứ tự thời gian
      if (reading.temperature !== null && (acc.temperatureAt === null || reading.received_at > acc.temperatureAt)) {
        acc.temperature = reading.temperature;
        acc.temperatureAt = reading.received_at;
      }
      if (reading.humidity !== null && (acc.humidityAt === null || reading.received_at > acc.humidityAt)) {
        acc.humidity = reading.humidity;
        acc.humidityAt = reading.received_at;
      }
      climate.set(sensor.room_id, acc);
    }
  }

  return rooms.map((room): RoomSummary => {
    const acc = climate.get(room.id);
    // Thời điểm cập nhật khí hậu = mốc mới hơn trong hai chỉ số (chuỗi ISO sort đúng thứ tự thời gian)
    const stamps = [acc?.temperatureAt, acc?.humidityAt].filter((value): value is string => typeof value === "string");
    const updatedAt = stamps.length > 0 ? (stamps.sort().pop() ?? null) : null;
    return {
      id: room.id,
      home_id: room.home_id,
      name: room.name,
      room_type: room.room_type,
      sort_order: room.sort_order,
      temperature: acc?.temperature ?? null,
      humidity: acc?.humidity ?? null,
      has_climate_data: acc !== undefined && (acc.temperature !== null || acc.humidity !== null),
      climate_updated_at: updatedAt,
      device_count: toCount(room.device_count),
      online_count: toCount(room.online_count),
      on_count: toCount(room.on_count),
    };
  });
}

// ── INSERT cho provisioning ────────────────────────────────────────────────

export async function insertHome(
  db: Queryable,
  input: {
    name: string;
    packageCode: PackageCode;
    address: string | null;
    expectedOwnerName: string | null;
    createdBy: number;
  }
): Promise<number> {
  const result = await runSql(
    `INSERT INTO smart_homes (name, package_code, address, expected_owner_name, status, created_by)
     VALUES (?, ?, ?, ?, 'unclaimed', ?)
     RETURNING id`,
    [input.name, input.packageCode, input.address, input.expectedOwnerName, input.createdBy],
    db
  );
  return result.insertId;
}

export async function insertRoom(
  db: Queryable,
  input: { homeId: number; name: string; roomType: string; sortOrder: number }
): Promise<number> {
  const result = await runSql(
    "INSERT INTO rooms (home_id, name, room_type, sort_order) VALUES (?, ?, ?, ?) RETURNING id",
    [input.homeId, input.name, input.roomType, input.sortOrder],
    db
  );
  return result.insertId;
}

export interface NewDeviceRecord {
  uid: string;
  name: string;
  deviceType: "sensor" | "gateway";
  category: DeviceCategory;
  /** secret_key HMAC — chỉ ghi vào DB, không bao giờ trả về/log (invariant 1, 2). */
  secret: string;
  homeId: number;
  roomId: number | null;
  gatewayDeviceId: number | null;
  nodeUid: string | null;
  powerState: false | null;
  firmwareVersion: string;
  location: string | null;
  simulated: boolean;
  createdBy: number;
}

/** Thiết bị mới của KIT: status 'active' (đã được nhà máy cấp danh tính); simulated → coi như đã provision và online. */
export async function insertDevice(db: Queryable, device: NewDeviceRecord): Promise<number> {
  const result = await runSql(
    `INSERT INTO devices
       (device_id, device_name, device_type, secret_key, status, location, fail_count, created_by,
        home_id, room_id, gateway_device_id, node_uid, category, power_state, firmware_version,
        provision_status, is_simulated, sim_online, last_seen)
     VALUES (?, ?, ?, ?, 'active', ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?)
     RETURNING id`,
    [
      device.uid,
      device.name,
      device.deviceType,
      device.secret,
      device.location,
      device.createdBy,
      device.homeId,
      device.roomId,
      device.gatewayDeviceId,
      device.nodeUid,
      device.category,
      device.powerState,
      device.firmwareVersion,
      device.simulated ? "provisioned" : "pending",
      device.simulated,
      device.simulated ? new Date() : null,
    ],
    db
  );
  return result.insertId;
}
