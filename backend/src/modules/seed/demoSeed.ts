// Seed dữ liệu demo (CONTRACT_V2 §8). server.ts gọi `await runDemoSeed()` ngay sau migration, trước khi
// listen. Chạy đúng một lần (dòng `seed_demo_v2` trong _migrations), chỉ khi env.seedDemoData.
//
// Idempotent kể cả khi lần chạy trước dừng giữa chừng:
//   - user/khách: tìm theo username/email trước khi tạo;
//   - mỗi nhà là MỘT transaction và được nhận diện theo tên → đã có thì bỏ qua cả nhà;
//   - phần dùng chung (grant, firmware, OTA, thông báo nhân viên, audit chung) + dòng marker nằm trong
//     MỘT transaction cuối: marker chỉ tồn tại khi mọi thứ đã xong.
//
// Bảo mật (invariant 1, 2): mật khẩu demo chỉ có trong mã này (đã công khai ở CONTRACT/UI demo) và được
// băm bcrypt cost 12; secret thiết bị do createKitHome sinh ngẫu nhiên, không bao giờ in ra; mã kích hoạt
// cố định chỉ lưu SHA-256. Log chỉ in số lượng "[seed] created …".
import bcrypt from "bcrypt";
import type { PoolConnection } from "mysql2/promise";
import { env } from "../../config/env";
import { generateActivationCode, hashActivationCode, normalizeActivationCode } from "../../lib/activationCode";
import { newUuid, sha256Hex } from "../../lib/crypto";
import { queryOne, queryRows, runSql, withTransaction, type SqlParam } from "../../lib/db";
import { homeLocalParts } from "../../lib/time";
import type { Severity } from "../../types/domain";
import { assignOwner } from "../homes/activation.service";
import { createKitHome } from "../homes/provisioning.service";
import type { KitHomeResult } from "../homes/homes.types";
import { resolveEventMeta } from "../logs/eventCatalog";

const MARKER = "seed_demo_v2";
const BCRYPT_COST = 12; // khớp auth.service / routes/users.ts
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
// Nhà demo dùng múi giờ mặc định Asia/Ho_Chi_Minh (UTC+7, không có DST) — cần để dựng "23:00 giờ địa phương"
const VN_OFFSET_MS = 7 * HOUR;
const TIMEZONE = "Asia/Ho_Chi_Minh";
const INSERT_CHUNK = 500;

const counts = {
  users: 0,
  homes: 0,
  devices: 0,
  members: 0,
  rules: 0,
  sensor_data: 0,
  behavior_logs: 0,
  notifications: 0,
  audit: 0,
  firmware: 0,
};

// ── Tiện ích thời gian / ngẫu nhiên ────────────────────────────────────────

const ago = (ms: number): Date => new Date(Math.floor((Date.now() - ms) / 1000) * 1000);
const fromNow = (ms: number): Date => ago(-ms);
const rand = (min: number, max: number): number => min + Math.random() * (max - min);
const randInt = (min: number, max: number): number => Math.floor(rand(min, max + 1));

/** 00:00 giờ địa phương của `daysAgo` ngày trước, tính bằng ms UTC. */
function localMidnightUtc(daysAgo: number): number {
  const shifted = new Date(Date.now() + VN_OFFSET_MS);
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() - daysAgo) - VN_OFFSET_MS;
}

async function insertChunks(conn: PoolConnection, head: string, columns: number, rows: SqlParam[][]): Promise<void> {
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK);
    const tuple = `(${new Array(columns).fill("?").join(", ")})`;
    await runSql(`${head} VALUES ${new Array(chunk.length).fill(tuple).join(", ")}`, chunk.flat(), conn);
  }
}

// ── Người dùng ─────────────────────────────────────────────────────────────

const passwordHashes = new Map<string, Promise<string>>();
/** Cùng một mật khẩu demo dùng chung một hash (bcrypt đã có salt) để seed không tốn 8 × ~250 ms. */
function hashPassword(password: string): Promise<string> {
  let hash = passwordHashes.get(password);
  if (!hash) {
    hash = bcrypt.hash(password, BCRYPT_COST);
    passwordHashes.set(password, hash);
  }
  return hash;
}

async function ensureStaff(username: string, role: "admin" | "operator", fullName: string, password: string): Promise<number> {
  const existing = await queryOne<{ id: number }>("SELECT id FROM users WHERE username = ?", [username]);
  if (existing) return existing.id;
  const result = await runSql(
    "INSERT INTO users (username, password_hash, role, full_name, status) VALUES (?, ?, ?, ?, 'active')",
    [username, await hashPassword(password), role, fullName]
  );
  counts.users += 1;
  return result.insertId;
}

interface CustomerSpec {
  email: string;
  fullName: string;
  userTag: string;
  phone: string;
  address: string;
}

async function ensureCustomer(spec: CustomerSpec): Promise<number> {
  const existing = await queryOne<{ id: number }>("SELECT id FROM users WHERE email = ?", [spec.email]);
  if (existing) return existing.id;
  const hash = await hashPassword("user123");
  // users + customers: ghi 2 bảng → 1 transaction (invariant 9)
  const userId = await withTransaction(async (conn) => {
    const user = await runSql(
      "INSERT INTO users (username, email, full_name, password_hash, role, status, last_login) VALUES (NULL, ?, ?, ?, 'user', 'active', ?)",
      [spec.email, spec.fullName, hash, ago(randInt(1, 12) * HOUR)],
      conn
    );
    await runSql(
      "INSERT INTO customers (user_id, full_name, phone, address, user_tag) VALUES (?, ?, ?, ?, ?)",
      [user.insertId, spec.fullName, spec.phone, spec.address, spec.userTag],
      conn
    );
    return user.insertId;
  });
  counts.users += 1;
  return userId;
}

// ── Audit / thông báo (INSERT trực tiếp để đặt được created_at trong quá khứ) ─

interface AuditSeed {
  eventType: string;
  homeId: number | null;
  deviceId?: number | null;
  actorUserId?: number | null;
  message: string;
  minutesAgo: number;
  details?: Record<string, unknown>;
}

async function insertAudit(conn: PoolConnection, rows: AuditSeed[]): Promise<void> {
  if (rows.length === 0) return;
  const params = rows.map((row): SqlParam[] => {
    const meta = resolveEventMeta(row.eventType);
    return [
      row.eventType,
      meta.category,
      meta.severity,
      row.deviceId ?? null,
      row.homeId,
      row.actorUserId ?? null,
      row.message,
      row.details ? JSON.stringify(row.details) : null,
      ago(row.minutesAgo * MINUTE),
    ];
  });
  await insertChunks(
    conn,
    "INSERT INTO audit_log (event_type, category, severity, device_id, home_id, actor_user_id, message, details, created_at)",
    9,
    params
  );
  counts.audit += rows.length;
}

interface CustomerNotificationSeed {
  userId: number;
  homeId: number;
  type: string;
  title: string;
  message: string;
  severity: Severity;
  isRead: boolean;
  minutesAgo: number;
  relatedDeviceId?: number | null;
}

async function insertCustomerNotifications(conn: PoolConnection, rows: CustomerNotificationSeed[]): Promise<void> {
  if (rows.length === 0) return;
  const params = rows.map((row): SqlParam[] => [
    row.title,
    row.message,
    row.type,
    row.severity,
    "user",
    row.userId,
    row.homeId,
    row.relatedDeviceId ?? null,
    row.isRead ? 1 : 0,
    ago(row.minutesAgo * MINUTE),
  ]);
  await insertChunks(
    conn,
    "INSERT INTO notifications (title, message, type, severity, target_role, user_id, home_id, related_device_id, is_read, created_at)",
    10,
    params
  );
  counts.notifications += rows.length;
}

interface StaffNotificationSeed {
  targetRole: "admin" | "operator" | "all";
  type: string;
  title: string;
  message: string;
  severity: Severity;
  homeId: number | null;
  isRead: boolean;
  minutesAgo: number;
}

async function insertStaffNotifications(conn: PoolConnection, rows: StaffNotificationSeed[]): Promise<void> {
  for (const row of rows) {
    await runSql(
      `INSERT INTO notifications (title, message, type, severity, target_role, home_id, is_read, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [row.title, row.message, row.type, row.severity, row.targetRole, row.homeId, row.isRead ? 1 : 0, ago(row.minutesAgo * MINUTE)],
      conn
    );
  }
  counts.notifications += rows.length;
}

// ── Dựng nhà ───────────────────────────────────────────────────────────────

interface Actors {
  adminId: number;
  operator01Id: number;
  dat: number;
  lan: number;
  hoa: number;
  hung: number;
  kimanh: number;
}

interface HomeSpec {
  name: string;
  packageCode: "KIT_A" | "KIT_B";
  address: string;
  expectedOwnerName: string | null;
  createdDaysAgo: number;
}

async function homeExists(name: string): Promise<boolean> {
  return (await queryOne<{ id: number }>("SELECT id FROM smart_homes WHERE name = ?", [name])) !== null;
}

async function buildKit(conn: PoolConnection, spec: HomeSpec, actors: Actors): Promise<KitHomeResult> {
  const kit = await createKitHome(conn, {
    name: spec.name,
    packageCode: spec.packageCode,
    address: spec.address,
    expectedOwnerName: spec.expectedOwnerName,
    createdBy: actors.adminId,
    simulated: true,
  });
  await runSql("UPDATE smart_homes SET created_at = ? WHERE id = ?", [ago(spec.createdDaysAgo * DAY), kit.home.id], conn);
  counts.homes += 1;
  counts.devices += 1 + kit.devices.length;
  return kit;
}

function code12(display: string): string {
  const normalized = normalizeActivationCode(display);
  if (!normalized) throw new Error("seed: invalid built-in activation code");
  return normalized;
}

async function insertToken(
  conn: PoolConnection,
  homeId: number,
  code: string,
  expiresAt: Date,
  createdAt: Date,
  createdBy: number
): Promise<{ id: number; hash: string }> {
  const hash = hashActivationCode(code);
  const result = await runSql(
    "INSERT INTO activation_tokens (home_id, code_hash, expires_at, created_by, created_at) VALUES (?, ?, ?, ?, ?)",
    [homeId, hash, expiresAt, createdBy, createdAt],
    conn
  );
  return { id: result.insertId, hash };
}

/** Claim thật qua assignOwner (cùng đường với API), rồi lùi mốc thời gian cho giống dữ liệu đã chạy lâu. */
async function claimHome(
  conn: PoolConnection,
  kit: KitHomeResult,
  ownerId: number,
  code: string,
  claimedDaysAgo: number,
  actors: Actors
): Promise<void> {
  const homeId = kit.home.id;
  const claimedAt = ago(claimedDaysAgo * DAY);
  const token = await insertToken(conn, homeId, code, fromNow(150 * DAY), ago((claimedDaysAgo + 1) * DAY), actors.adminId);
  await assignOwner(conn, { homeId, userId: ownerId, tokenId: token.id, actorUserId: null });
  await runSql("UPDATE activation_tokens SET used_at = ? WHERE id = ?", [claimedAt, token.id], conn);
  await runSql("UPDATE smart_homes SET claimed_at = ? WHERE id = ?", [claimedAt, homeId], conn);
  await runSql(
    `INSERT INTO activation_logs (home_id, user_id, activation_token_id, code_hash, method, result, reason, ip_address, user_agent, created_at)
     VALUES (?, ?, ?, ?, 'code', 'success', NULL, '192.168.1.20', 'SmartHome Mobile', ?)`,
    [homeId, ownerId, token.id, token.hash, claimedAt],
    conn
  );
}

function deviceByName(kit: KitHomeResult, name: string): KitHomeResult["devices"][number] {
  const device = kit.devices.find((item) => item.device_name === name);
  if (!device) throw new Error("seed: device not found in kit");
  return device;
}

function roomByType(kit: KitHomeResult, type: string): KitHomeResult["rooms"][number] {
  const room = kit.rooms.find((item) => item.room_type === type);
  if (!room) throw new Error("seed: room not found in kit");
  return room;
}

// Số đo 7 ngày, mỗi 10 phút: nhiệt độ/độ ẩm theo chu kỳ ngày + nhiễu; vài lần mở/đóng cửa
async function seedTelemetry(conn: PoolConnection, kit: KitHomeResult): Promise<void> {
  const base: Record<string, { temp: number; hum: number }> = {
    bedroom: { temp: 29, hum: 66 },
    living_room: { temp: 27, hum: 62 },
    kitchen: { temp: 28, hum: 70 },
    office: { temp: 26.5, hum: 60 },
  };
  const nowSec = Math.floor(Date.now() / 1000) * 1000;
  const rows: SqlParam[][] = [];
  for (const sensor of kit.devices.filter((device) => device.category === "sensor")) {
    const room = kit.rooms.find((item) => item.id === sensor.room_id);
    const profile = base[room?.room_type ?? "living_room"] ?? base.living_room;
    for (let i = 7 * 144 - 1; i >= 0; i--) {
      const at = new Date(nowSec - i * 10 * MINUTE);
      const hour = homeLocalParts(at, TIMEZONE).minuteOfDay / 60;
      const wave = Math.sin(((hour - 9) / 24) * 2 * Math.PI); // đỉnh ~15h, đáy ~3h
      const temperature = Math.min(34, Math.max(22, profile.temp + 3 * wave + rand(-0.4, 0.4)));
      const humidity = Math.min(85, Math.max(45, profile.hum - 8 * wave + rand(-1.5, 1.5)));
      rows.push([
        sensor.id,
        kit.gateway.id,
        JSON.stringify({ temperature: Math.round(temperature * 10) / 10, humidity: Math.round(humidity * 10) / 10 }),
        at,
      ]);
    }
  }
  for (const door of kit.devices.filter((device) => device.category === "door_contact")) {
    const openings = Array.from({ length: 12 }, () => nowSec - randInt(10, 7 * 24 * 60 - 10) * MINUTE).sort((a, b) => a - b);
    for (const openAt of openings) {
      rows.push([door.id, kit.gateway.id, JSON.stringify({ door_open: true }), new Date(openAt)]);
      rows.push([door.id, kit.gateway.id, JSON.stringify({ door_open: false }), new Date(openAt + 25_000)]);
    }
  }
  await insertChunks(conn, "INSERT INTO sensor_data (device_id, gateway_id, payload, received_at)", 4, rows);
  counts.sensor_data += rows.length;
}

interface BehaviorSeed {
  userId: number;
  roomId: number | null;
  deviceId: number;
  action: "TURN_ON" | "TURN_OFF";
  at: Date;
}

async function seedBehavior(conn: PoolConnection, homeId: number, rows: BehaviorSeed[]): Promise<void> {
  const params = rows.map((row): SqlParam[] => {
    const local = homeLocalParts(row.at, TIMEZONE);
    const on = row.action === "TURN_ON";
    return [
      newUuid(),
      row.at,
      row.userId,
      homeId,
      row.roomId,
      row.deviceId,
      "relay",
      row.action,
      on ? "OFF" : "ON",
      on ? "ON" : "OFF",
      local.weekday,
      local.minuteOfDay,
      local.weekday === 0 || local.weekday === 6 ? 1 : 0,
      "mobile",
    ];
  });
  // is_holiday luôn 0 → để nguyên mặc định cột
  await insertChunks(
    conn,
    `INSERT INTO user_behavior_logs
       (event_id, timestamp, user_id, smart_home_id, room_id, device_id, device_type, action, previous_state, new_state,
        weekday, minute_of_day, is_weekend, source)`,
    14,
    params
  );
  counts.behavior_logs += rows.length;
}

/** Mỗi ngày trong `days` có một hành động quanh `minute` giờ địa phương (±jitter phút). */
function habitEvents(
  days: number[],
  minute: number,
  jitter: number,
  base: Omit<BehaviorSeed, "at">
): BehaviorSeed[] {
  return days.map((daysAgo) => ({
    ...base,
    at: new Date(localMidnightUtc(daysAgo) + (minute + randInt(-jitter, jitter)) * MINUTE),
  }));
}

// ── Nhà 1: "Nhà của Đạt" ───────────────────────────────────────────────────

async function seedHome1(actors: Actors): Promise<void> {
  const spec: HomeSpec = {
    name: "Nhà của Đạt",
    packageCode: "KIT_A",
    address: "12 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh",
    expectedOwnerName: "Nguyễn Hoàng Đạt",
    createdDaysAgo: 30,
  };
  if (await homeExists(spec.name)) return;

  await withTransaction(async (conn) => {
    const kit = await buildKit(conn, spec, actors);
    const homeId = kit.home.id;
    // Mã claim của nhà này ngẫu nhiên; bản rõ bị bỏ ngay sau khi băm (không ai cần dùng lại)
    await claimHome(conn, kit, actors.dat, generateActivationCode(), 28, actors);

    const light = deviceByName(kit, "Đèn phòng khách");
    const fan = deviceByName(kit, "Quạt phòng ngủ");
    const kitchenLight = deviceByName(kit, "Đèn nhà bếp");
    const bedroom = roomByType(kit, "bedroom");

    // Thành viên: Lan CONTROLLER, Hoa VIEWER, lời mời GUEST đang chờ cho Minh (chỉ Đèn phòng khách)
    await runSql(
      `INSERT INTO smart_home_members (home_id, user_id, member_role, display_name, invited_by, accepted_at, created_at)
       VALUES (?, ?, 'CONTROLLER', 'Trần Thị Lan', ?, ?, ?)`,
      [homeId, actors.lan, actors.dat, ago(19 * DAY), ago(20 * DAY)],
      conn
    );
    await runSql(
      `INSERT INTO smart_home_members (home_id, user_id, member_role, display_name, invited_by, accepted_at, created_at)
       VALUES (?, ?, 'VIEWER', 'Phạm Thị Hoa', ?, ?, ?)`,
      [homeId, actors.hoa, actors.dat, ago(18 * DAY), ago(19 * DAY)],
      conn
    );
    const minh = await runSql(
      `INSERT INTO smart_home_members
         (home_id, user_id, member_role, display_name, invite_email, invite_expires_at, invited_by, expires_at, created_at)
       VALUES (?, NULL, 'GUEST', 'Minh', 'minh@smarthome.local', ?, ?, ?, ?)`,
      [homeId, fromNow(6 * DAY), actors.dat, fromNow(3 * DAY), ago(1 * DAY)],
      conn
    );
    await runSql("INSERT INTO member_device_access (member_id, device_id) VALUES (?, ?)", [minh.insertId, light.id], conn);
    counts.members += 4; // OWNER + Lan + Hoa + lời mời Minh

    // Quy tắc
    const hot = await runSql(
      `INSERT INTO automation_rules
         (home_id, name, trigger_type, is_enabled, condition_room_id, condition_sensor_type, condition_operator,
          condition_threshold_value, action_device_id, action_command, origin, last_condition_state, last_triggered_at,
          created_by, created_at)
       VALUES (?, 'Phòng ngủ nóng → bật quạt', 'sensor_threshold', 1, ?, 'TEMPERATURE', '>', 30, ?, 'turn_on', 'user', 0, ?, ?, ?)`,
      [homeId, bedroom.id, fan.id, ago(26 * HOUR), actors.dat, ago(15 * DAY)],
      conn
    );
    const night = await runSql(
      `INSERT INTO automation_rules
         (home_id, name, trigger_type, is_enabled, schedule_time_of_day, schedule_days_of_week, action_device_id,
          action_command, origin, last_triggered_at, created_by, created_at)
       VALUES (?, 'Tắt đèn bếp lúc 23:30', 'schedule', 1, '23:30', '1,2,3,4,5,6,7', ?, 'turn_off', 'user', ?, ?, ?)`,
      [homeId, kitchenLight.id, new Date(localMidnightUtc(1) + (23 * 60 + 30) * MINUTE), actors.dat, ago(14 * DAY)],
      conn
    );
    counts.rules += 2;
    const history: SqlParam[][] = [
      [hot.insertId, homeId, ago(26 * HOUR), "success", JSON.stringify({ trigger: { type: "sensor_threshold", value: 30.6 }, action: "turn_on" })],
      [hot.insertId, homeId, ago(3 * DAY + 2 * HOUR), "success", JSON.stringify({ trigger: { type: "sensor_threshold", value: 31.2 }, action: "turn_on" })],
      [night.insertId, homeId, new Date(localMidnightUtc(1) + (23 * 60 + 30) * MINUTE), "success", JSON.stringify({ trigger: { type: "schedule", time: "23:30" }, action: "turn_off" })],
      [night.insertId, homeId, new Date(localMidnightUtc(2) + (23 * 60 + 30) * MINUTE), "skipped", JSON.stringify({ trigger: { type: "schedule", time: "23:30" }, reason: "ALREADY_IN_STATE" })],
      [night.insertId, homeId, new Date(localMidnightUtc(3) + (23 * 60 + 30) * MINUTE), "success", JSON.stringify({ trigger: { type: "schedule", time: "23:30" }, action: "turn_off" })],
    ];
    await insertChunks(conn, "INSERT INTO automation_history (rule_id, home_id, triggered_at, result, details)", 5, history);

    // Hành vi: đèn khách tắt ~23:00 (6/7 ngày), quạt ngủ bật ~22:00 (5/7 ngày) + vài hành động nhiễu
    const behavior: BehaviorSeed[] = [
      ...habitEvents([1, 2, 3, 5, 6, 7], 23 * 60, 10, { userId: actors.dat, roomId: light.room_id, deviceId: light.id, action: "TURN_OFF" }),
      ...habitEvents([1, 2, 3, 5, 6], 22 * 60, 10, { userId: actors.dat, roomId: fan.room_id, deviceId: fan.id, action: "TURN_ON" }),
      ...[1, 3, 6].map((daysAgo): BehaviorSeed => ({
        userId: actors.lan,
        roomId: kitchenLight.room_id,
        deviceId: kitchenLight.id,
        action: "TURN_ON",
        at: new Date(localMidnightUtc(daysAgo) + randInt(5 * 60, 19 * 60) * MINUTE),
      })),
    ];
    await seedBehavior(conn, homeId, behavior);

    // Gợi ý đang chờ cho thói quen thứ nhất (trình bày 2 ngày trước) — job sẽ bỏ qua nó và tìm thói quen quạt
    const config = {
      name: "Tắt Đèn phòng khách lúc 23:00",
      trigger_type: "schedule",
      schedule_time: "23:00",
      schedule_days: [1, 2, 3, 4, 5, 6, 7],
      action_device_id: light.id,
      action_command: "turn_off",
    };
    await runSql(
      `INSERT INTO recommendation_history
         (home_id, device_id, action, time_of_day, days_matched, window_days, suggested_rule_config, status, presented_at)
       VALUES (?, ?, 'turn_off', '23:00', 6, 7, ?, 'pending', ?)`,
      [homeId, light.id, JSON.stringify(config), ago(2 * DAY)],
      conn
    );

    await seedTelemetry(conn, kit);

    await insertCustomerNotifications(conn, [
      { userId: actors.dat, homeId, type: "HOME_CLAIMED", title: "Chào mừng về nhà", message: `Nhà "${spec.name}" đã được kích hoạt. Bạn là chủ nhà.`, severity: "success", isRead: true, minutesAgo: 28 * 24 * 60 },
      { userId: actors.dat, homeId, type: "SUGGESTION_NEW", title: "Gợi ý tự động hoá mới", message: "6/7 ngày qua bạn tắt Đèn phòng khách vào khoảng 23:00. Bạn có muốn tạo lịch tự động không?", severity: "info", isRead: false, minutesAgo: 2 * 24 * 60, relatedDeviceId: light.id },
      { userId: actors.dat, homeId, type: "AUTOMATION_TRIGGERED", title: "Tự động hoá đã chạy", message: "Quy tắc “Phòng ngủ nóng → bật quạt” đã chạy: Bật Quạt phòng ngủ.", severity: "success", isRead: false, minutesAgo: 26 * 60, relatedDeviceId: fan.id },
      { userId: actors.dat, homeId, type: "DOOR_OPENED", title: "Cửa đang mở", message: "Cảm biến cửa chính (Cửa chính) vừa báo cửa mở.", severity: "warning", isRead: false, minutesAgo: 95 },
      { userId: actors.dat, homeId, type: "DEVICE_OFFLINE", title: "Thiết bị mất kết nối", message: "Cảm biến nhiệt/ẩm nhà bếp (Nhà bếp) đã mất kết nối.", severity: "warning", isRead: true, minutesAgo: 4 * 24 * 60 },
      { userId: actors.lan, homeId, type: "AUTOMATION_TRIGGERED", title: "Tự động hoá đã chạy", message: "Quy tắc “Phòng ngủ nóng → bật quạt” đã chạy: Bật Quạt phòng ngủ.", severity: "success", isRead: false, minutesAgo: 26 * 60, relatedDeviceId: fan.id },
      { userId: actors.lan, homeId, type: "DOOR_OPENED", title: "Cửa đang mở", message: "Cảm biến cửa chính (Cửa chính) vừa báo cửa mở.", severity: "warning", isRead: true, minutesAgo: 95 },
      { userId: actors.hoa, homeId, type: "DOOR_OPENED", title: "Cửa đang mở", message: "Cảm biến cửa chính (Cửa chính) vừa báo cửa mở.", severity: "warning", isRead: false, minutesAgo: 95 },
    ]);

    await insertAudit(conn, [
      { eventType: "HOME_CREATED", homeId, actorUserId: actors.adminId, message: `Tạo nhà "${spec.name}" (KIT_A)`, minutesAgo: 30 * 1440 },
      { eventType: "ACTIVATION_CODE_CREATED", homeId, actorUserId: actors.adminId, message: `Tạo mã kích hoạt cho nhà "${spec.name}"`, minutesAgo: 29 * 1440 },
      { eventType: "ACTIVATION_SUCCESS", homeId, actorUserId: actors.dat, message: `Kích hoạt nhà "${spec.name}" thành công`, minutesAgo: 28 * 1440 },
      { eventType: "GATEWAY_ONLINE", homeId, deviceId: kit.gateway.id, message: `Gateway ${kit.gateway.device_id} đã kết nối`, minutesAgo: 28 * 1440 - 5 },
      { eventType: "MEMBER_INVITED", homeId, actorUserId: actors.dat, message: "Mời Trần Thị Lan làm Người điều khiển", minutesAgo: 20 * 1440 },
      { eventType: "MEMBER_JOINED", homeId, actorUserId: actors.lan, message: "Trần Thị Lan đã tham gia nhà", minutesAgo: 19 * 1440 },
      { eventType: "MEMBER_INVITED", homeId, actorUserId: actors.dat, message: "Mời Phạm Thị Hoa làm Người xem", minutesAgo: 19 * 1440 + 30 },
      { eventType: "MEMBER_JOINED", homeId, actorUserId: actors.hoa, message: "Phạm Thị Hoa đã tham gia nhà", minutesAgo: 18 * 1440 },
      { eventType: "AUTOMATION_CREATED", homeId, actorUserId: actors.dat, message: 'Tạo quy tắc "Phòng ngủ nóng → bật quạt"', minutesAgo: 15 * 1440 },
      { eventType: "AUTOMATION_CREATED", homeId, actorUserId: actors.dat, message: 'Tạo quy tắc "Tắt đèn bếp lúc 23:30"', minutesAgo: 14 * 1440 },
      { eventType: "OTA_DEPLOYED", homeId, actorUserId: actors.adminId, message: "Triển khai firmware node 1.4.0 cho nhà", minutesAgo: 10 * 1440 },
      { eventType: "OTA_COMPLETED", homeId, message: "Triển khai OTA firmware node 1.4.0 hoàn tất", minutesAgo: 10 * 1440 - 20 },
      { eventType: "DEVICE_COMMAND", homeId, deviceId: light.id, actorUserId: actors.dat, message: 'Tắt "Đèn phòng khách"', minutesAgo: 14 * 60 },
      { eventType: "DEVICE_COMMAND", homeId, deviceId: fan.id, actorUserId: null, message: 'Bật "Quạt phòng ngủ"', minutesAgo: 26 * 60 },
      { eventType: "AUTOMATION_TRIGGERED", homeId, deviceId: fan.id, message: 'Quy tắc "Phòng ngủ nóng → bật quạt" đã chạy: Bật Quạt phòng ngủ', minutesAgo: 26 * 60 },
      { eventType: "DEVICE_OFFLINE", homeId, message: 'Thiết bị "Cảm biến nhiệt/ẩm nhà bếp" mất kết nối', minutesAgo: 4 * 1440 },
      { eventType: "SUGGESTION_CREATED", homeId, deviceId: light.id, message: "Gợi ý thói quen: tắt Đèn phòng khách lúc 23:00 (6/7 ngày)", minutesAgo: 2 * 1440 },
      { eventType: "MEMBER_INVITED", homeId, actorUserId: actors.dat, message: "Mời minh@smarthome.local làm Khách (3 ngày)", minutesAgo: 1440 },
    ]);
  });
}

// ── Nhà 2: "Nhà Quận 7" ────────────────────────────────────────────────────

async function seedHome2(actors: Actors): Promise<void> {
  const spec: HomeSpec = {
    name: "Nhà Quận 7",
    packageCode: "KIT_A",
    address: "88 Nguyễn Lương Bằng, Quận 7, TP. Hồ Chí Minh",
    expectedOwnerName: "Lê Văn Hùng",
    createdDaysAgo: 25,
  };
  if (await homeExists(spec.name)) return;

  await withTransaction(async (conn) => {
    const kit = await buildKit(conn, spec, actors);
    const homeId = kit.home.id;
    // Mã cố định của CONTRACT §8 (chỉ lưu SHA-256): khách đã claim bằng mã này nên token ở trạng thái "đã dùng"
    await claimHome(conn, kit, actors.hung, code12("Q4ZT-6MJK-1PSX"), 20, actors);
    // Một lần nhập sai trước đó của chính chủ (hiện trong lịch sử kích hoạt của khách)
    await runSql(
      `INSERT INTO activation_logs (home_id, user_id, code_hash, method, result, reason, ip_address, user_agent, created_at)
       VALUES (NULL, ?, ?, 'code', 'failed', 'NOT_FOUND', '192.168.1.45', 'SmartHome Mobile', ?)`,
      [actors.hung, sha256Hex("seed-mistyped-code"), ago(20 * DAY + 3 * MINUTE)],
      conn
    );
    counts.members += 1;

    const light = deviceByName(kit, "Đèn phòng khách");
    await seedTelemetry(conn, kit);

    await insertCustomerNotifications(conn, [
      { userId: actors.hung, homeId, type: "HOME_CLAIMED", title: "Chào mừng về nhà", message: `Nhà "${spec.name}" đã được kích hoạt. Bạn là chủ nhà.`, severity: "success", isRead: true, minutesAgo: 20 * 1440 },
      { userId: actors.hung, homeId, type: "GATEWAY_OFFLINE", title: "Gateway mất kết nối", message: `Gateway của nhà "${spec.name}" đã mất kết nối. Các thiết bị sẽ không điều khiển được cho tới khi kết nối lại.`, severity: "critical", isRead: false, minutesAgo: 5 * 60 },
      { userId: actors.hung, homeId, type: "GATEWAY_ONLINE", title: "Gateway đã kết nối lại", message: `Gateway của nhà "${spec.name}" đã hoạt động trở lại.`, severity: "success", isRead: false, minutesAgo: 5 * 60 - 10 },
    ]);

    await insertAudit(conn, [
      { eventType: "HOME_CREATED", homeId, actorUserId: actors.adminId, message: `Tạo nhà "${spec.name}" (KIT_A)`, minutesAgo: 25 * 1440 },
      { eventType: "ACTIVATION_CODE_CREATED", homeId, actorUserId: actors.adminId, message: `Tạo mã kích hoạt cho nhà "${spec.name}"`, minutesAgo: 24 * 1440 },
      { eventType: "ACTIVATION_FAILED", homeId: null, actorUserId: actors.hung, message: "Nhập mã kích hoạt không tồn tại", minutesAgo: 20 * 1440 + 3 },
      { eventType: "ACTIVATION_SUCCESS", homeId, actorUserId: actors.hung, message: `Kích hoạt nhà "${spec.name}" thành công`, minutesAgo: 20 * 1440 },
      { eventType: "GATEWAY_ONLINE", homeId, deviceId: kit.gateway.id, message: `Gateway ${kit.gateway.device_id} đã kết nối`, minutesAgo: 20 * 1440 - 5 },
      { eventType: "GATEWAY_OFFLINE", homeId, deviceId: kit.gateway.id, message: `Gateway ${kit.gateway.device_id} mất kết nối`, minutesAgo: 5 * 60 },
      { eventType: "GATEWAY_ONLINE", homeId, deviceId: kit.gateway.id, message: `Gateway ${kit.gateway.device_id} đã kết nối lại`, minutesAgo: 5 * 60 - 10 },
      { eventType: "DEVICE_COMMAND", homeId, deviceId: light.id, actorUserId: actors.hung, message: 'Bật "Đèn phòng khách"', minutesAgo: 8 * 60 },
    ]);
  });
}

// ── Nhà 3–5: chưa claim ────────────────────────────────────────────────────

async function seedUnclaimedHome(
  actors: Actors,
  spec: HomeSpec,
  displayCode: string,
  expired: boolean
): Promise<void> {
  if (await homeExists(spec.name)) return;
  await withTransaction(async (conn) => {
    const kit = await buildKit(conn, spec, actors);
    const homeId = kit.home.id;
    const createdAt = ago(spec.createdDaysAgo * DAY);
    // Mã cố định của CONTRACT §8 (chỉ lưu SHA-256). Nhà 5: mã đã hết hạn (expires_at trong quá khứ)
    const expiresAt = expired ? ago(10 * DAY) : fromNow(180 * DAY - spec.createdDaysAgo * DAY);
    await insertToken(conn, homeId, code12(displayCode), expiresAt, createdAt, actors.adminId);

    const rows: AuditSeed[] = [
      { eventType: "HOME_CREATED", homeId, actorUserId: actors.adminId, message: `Tạo nhà "${spec.name}" (${spec.packageCode})`, minutesAgo: spec.createdDaysAgo * 1440 },
      { eventType: "ACTIVATION_CODE_CREATED", homeId, actorUserId: actors.adminId, message: `Tạo mã kích hoạt cho nhà "${spec.name}"`, minutesAgo: spec.createdDaysAgo * 1440 - 1 },
    ];
    if (expired) {
      // Khách thử mã đã hết hạn → lịch sử kích hoạt thất bại (EXPIRED)
      await runSql(
        `INSERT INTO activation_logs (home_id, user_id, code_hash, method, result, reason, ip_address, user_agent, created_at)
         VALUES (?, ?, ?, 'code', 'failed', 'EXPIRED', '192.168.1.77', 'SmartHome Mobile', ?)`,
        [homeId, actors.kimanh, hashActivationCode(code12(displayCode)), ago(8 * DAY)],
        conn
      );
      rows.push({ eventType: "ACTIVATION_FAILED", homeId, actorUserId: actors.kimanh, message: "Mã kích hoạt đã hết hạn", minutesAgo: 8 * 1440 });
    }
    await insertAudit(conn, rows);
  });
}

// ── Phần dùng chung + marker (một transaction) ─────────────────────────────

async function seedShared(actors: Actors): Promise<void> {
  await withTransaction(async (conn) => {
    const home1 = await queryOne<{ id: number }>("SELECT id FROM smart_homes WHERE name = 'Nhà của Đạt'", [], conn);
    const home2 = await queryOne<{ id: number }>("SELECT id FROM smart_homes WHERE name = 'Nhà Quận 7'", [], conn);
    const home5 = await queryOne<{ id: number }>("SELECT id FROM smart_homes WHERE name = 'Kit KIT_A #0005'", [], conn);

    // Grant của operator01 trên nhà Quận 7 (còn ~4 giờ)
    if (home2) {
      const existingGrant = await queryOne<{ id: number }>(
        "SELECT id FROM operator_home_access WHERE operator_user_id = ? AND home_id = ? AND revoked_at IS NULL AND expires_at > NOW()",
        [actors.operator01Id, home2.id],
        conn
      );
      if (!existingGrant) {
        const grantedAt = ago(10 * MINUTE);
        await runSql(
          `INSERT INTO operator_home_access (operator_user_id, home_id, reason, granted_by, expires_at, created_at)
           VALUES (?, ?, 'Ticket #1024 — gateway mất kết nối', ?, ?, ?)`,
          [actors.operator01Id, home2.id, actors.adminId, new Date(grantedAt.getTime() + 4 * HOUR), grantedAt],
          conn
        );
        await insertAudit(conn, [
          { eventType: "OPERATOR_ACCESS_GRANTED", homeId: home2.id, actorUserId: actors.adminId, message: "Cấp quyền xem nhà Quận 7 cho operator01 (4 giờ): Ticket #1024", minutesAgo: 10 },
          { eventType: "OPERATOR_HOME_VIEWED", homeId: home2.id, actorUserId: actors.operator01Id, message: 'Operator operator01 xem thiết bị của nhà "Nhà Quận 7"', minutesAgo: 6 },
        ]);
      }
    }

    // Firmware (chỉ metadata; file thật không cần tồn tại cho demo)
    const firmwareSeeds = [
      { type: "gateway", version: "2.3.1", stable: 1, notes: "Bản ổn định: sửa lỗi mất kết nối MQTT khi đổi WiFi.", daysAgo: 40 },
      { type: "node", version: "1.4.0", stable: 1, notes: "Bản ổn định: tiết kiệm pin, cải thiện độ chính xác cảm biến.", daysAgo: 35 },
      { type: "gateway", version: "2.4.0-beta.1", stable: 0, notes: "Bản thử nghiệm: hỗ trợ OTA theo nhà.", daysAgo: 3 },
    ] as const;
    for (const fw of firmwareSeeds) {
      const checksum = sha256Hex(`seed-firmware-${fw.type}-${fw.version}`);
      const result = await runSql(
        `INSERT IGNORE INTO firmware
           (target_type, version, file_name, size_bytes, checksum_sha256, storage_path, release_notes, is_stable, uploaded_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          fw.type,
          fw.version,
          `${fw.type}-${fw.version}.bin`,
          fw.type === "gateway" ? 1_048_576 : 524_288,
          checksum,
          `${env.firmwareStorageDir}/${checksum}.bin`,
          fw.notes,
          fw.stable,
          actors.adminId,
          ago(fw.daysAgo * DAY),
        ],
        conn
      );
      if (result.affectedRows > 0) {
        counts.firmware += 1;
        await insertAudit(conn, [
          { eventType: "FIRMWARE_UPLOADED", homeId: null, actorUserId: actors.adminId, message: `Tải lên firmware ${fw.type} ${fw.version}`, minutesAgo: fw.daysAgo * 1440 },
        ]);
      }
    }

    // Một job OTA đã hoàn tất: node 1.4.0 cho nhà của Đạt
    const anyJob = await queryOne<{ id: number }>("SELECT id FROM ota_jobs LIMIT 1", [], conn);
    const nodeFw = await queryOne<{ id: number }>("SELECT id FROM firmware WHERE target_type = 'node' AND version = '1.4.0'", [], conn);
    if (!anyJob && home1 && nodeFw) {
      const startedAt = ago(10 * DAY);
      const job = await runSql(
        `INSERT INTO ota_jobs (firmware_id, scope_type, scope_id, status, created_by, created_at, finished_at)
         VALUES (?, 'home', ?, 'completed', ?, ?, ?)`,
        [nodeFw.id, home1.id, actors.adminId, startedAt, new Date(startedAt.getTime() + 20 * MINUTE)],
        conn
      );
      const targets = await queryRows<{ id: number }>(
        "SELECT id FROM devices WHERE home_id = ? AND device_type <> 'gateway' ORDER BY id",
        [home1.id],
        conn
      );
      if (targets.length > 0) {
        await insertChunks(
          conn,
          "INSERT INTO ota_history (ota_job_id, device_id, status, progress_percent, started_at, finished_at)",
          6,
          targets.map((target, index): SqlParam[] => [
            job.insertId,
            target.id,
            "applied",
            100,
            new Date(startedAt.getTime() + index * 2 * MINUTE),
            new Date(startedAt.getTime() + (index * 2 + 3) * MINUTE),
          ])
        );
      }
    }

    // Thông báo nhân viên
    await insertStaffNotifications(conn, [
      { targetRole: "all", type: "HOME_CLAIMED", title: "Nhà đã được kích hoạt", message: 'Nhà "Nhà Quận 7" vừa được khách hàng kích hoạt.', severity: "success", homeId: home2?.id ?? null, isRead: true, minutesAgo: 20 * 1440 },
      { targetRole: "all", type: "GATEWAY_OFFLINE", title: "Gateway mất kết nối", message: 'Gateway của nhà "Nhà Quận 7" đã mất kết nối.', severity: "critical", homeId: home2?.id ?? null, isRead: false, minutesAgo: 5 * 60 },
      { targetRole: "all", type: "OTA_COMPLETED", title: "Cập nhật firmware hoàn tất", message: "Đợt cập nhật firmware node 1.4.0 đã hoàn tất trên mọi thiết bị.", severity: "success", homeId: home1?.id ?? null, isRead: true, minutesAgo: 10 * 1440 },
      { targetRole: "operator", type: "PROVISIONING", title: "Kit chờ giao cho khách", message: 'Nhà "Kit KIT_A #0003" đã sẵn sàng, chưa có chủ nhà.', severity: "info", homeId: null, isRead: false, minutesAgo: 5 * 1440 },
      { targetRole: "operator", type: "ACTIVATION_EXPIRED", title: "Mã kích hoạt đã hết hạn", message: 'Mã kích hoạt của "Kit KIT_A #0005" đã hết hạn — cần cấp mã mới.', severity: "warning", homeId: home5?.id ?? null, isRead: false, minutesAgo: 10 * 1440 },
      { targetRole: "admin", type: "OPERATOR_ACCESS", title: "Operator được cấp quyền xem nhà", message: "operator01 được cấp quyền xem nhà Quận 7 trong 4 giờ (Ticket #1024).", severity: "warning", homeId: home2?.id ?? null, isRead: false, minutesAgo: 10 },
    ]);

    // Audit chung (không gắn nhà)
    await insertAudit(conn, [
      { eventType: "LOGIN_SUCCESS", homeId: null, actorUserId: actors.adminId, message: "Quản trị viên đăng nhập", minutesAgo: 90 },
      { eventType: "LOGIN_SUCCESS", homeId: null, actorUserId: actors.operator01Id, message: "Nhân viên vận hành đăng nhập", minutesAgo: 20 },
      { eventType: "LOGIN_FAILED", homeId: null, message: "Đăng nhập thất bại: sai thông tin đăng nhập", minutesAgo: 240 },
      { eventType: "MQTT_CONNECTED", homeId: null, message: "Backend kết nối Broker 2 (TLS)", minutesAgo: 60 },
    ]);

    // Đánh dấu hoàn tất — cùng transaction nên chỉ tồn tại khi mọi thứ trên đã ghi xong
    await runSql("INSERT IGNORE INTO _migrations (name) VALUES (?)", [MARKER], conn);
  });
}

// ── Điểm vào ───────────────────────────────────────────────────────────────

export async function runDemoSeed(): Promise<void> {
  if (!env.seedDemoData) return;
  const done = await queryOne<{ name: string }>("SELECT name FROM _migrations WHERE name = ?", [MARKER]);
  if (done) return;

  const adminId = await ensureStaff("admin", "admin", "Quản trị viên", "admin123");
  const operator01Id = await ensureStaff("operator01", "operator", "Nhân viên vận hành 01", "operator123");
  await ensureStaff("operator02", "operator", "Nhân viên vận hành 02", "operator123");

  const dat = await ensureCustomer({ email: "user01@smarthome.local", fullName: "Nguyễn Hoàng Đạt", userTag: "dat#4821", phone: "0901234567", address: "12 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh" });
  const lan = await ensureCustomer({ email: "lan@smarthome.local", fullName: "Trần Thị Lan", userTag: "lan#3312", phone: "0912345678", address: "45 Lê Lợi, Quận 1, TP. Hồ Chí Minh" });
  const hoa = await ensureCustomer({ email: "hoa@smarthome.local", fullName: "Phạm Thị Hoa", userTag: "hoa#7756", phone: "0923456789", address: "7 Hai Bà Trưng, Quận 3, TP. Hồ Chí Minh" });
  const hung = await ensureCustomer({ email: "hung@smarthome.local", fullName: "Lê Văn Hùng", userTag: "hung#2094", phone: "0934567890", address: "88 Nguyễn Lương Bằng, Quận 7, TP. Hồ Chí Minh" });
  const kimanh = await ensureCustomer({ email: "kimanh@smarthome.local", fullName: "Ngô Kim Anh", userTag: "kimanh#1560", phone: "0945678901", address: "21 Trần Phú, Quận 5, TP. Hồ Chí Minh" });

  const actors: Actors = { adminId, operator01Id, dat, lan, hoa, hung, kimanh };

  await seedHome1(actors);
  await seedHome2(actors);
  await seedUnclaimedHome(actors, { name: "Kit KIT_A #0003", packageCode: "KIT_A", address: "Kho Quận Thủ Đức", expectedOwnerName: null, createdDaysAgo: 5 }, "7K2M-9QXA-4TPB", false);
  await seedUnclaimedHome(actors, { name: "Kit KIT_B #0004", packageCode: "KIT_B", address: "Kho Quận Thủ Đức", expectedOwnerName: null, createdDaysAgo: 3 }, "H3VD-8NRW-2CYE", false);
  await seedUnclaimedHome(actors, { name: "Kit KIT_A #0005", packageCode: "KIT_A", address: "Kho Quận Thủ Đức", expectedOwnerName: null, createdDaysAgo: 200 }, "B9FE-3WRA-7GMK", true);
  await seedShared(actors);

  // Chỉ số lượng — không bao giờ in mật khẩu/secret/mã kích hoạt
  console.log(
    `[seed] created users=${counts.users} homes=${counts.homes} devices=${counts.devices} members=${counts.members} ` +
      `rules=${counts.rules} sensor_data=${counts.sensor_data} behavior_logs=${counts.behavior_logs} ` +
      `notifications=${counts.notifications} audit=${counts.audit} firmware=${counts.firmware}`
  );
}
