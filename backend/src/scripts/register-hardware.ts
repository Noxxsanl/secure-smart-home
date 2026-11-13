// Đăng ký PHẦN CỨNG THẬT vào DB dev: đọc file NVS CSV của gateway (định dạng nvs_partition_gen: key,type,encoding,value)
// và tạo/cập nhật nhà + phòng (Phòng khách, Camera) + thiết bị (gateway, node nhiệt/ẩm, camera) khớp đúng device_id/secret
// đã nạp vào chip, kèm 4 thiết bị THẬT của phòng khách do Node điều khiển (đèn, quạt: relay; rèm: động cơ bước; điều hoà:
// IR — xem LIVING_ROOM_APPLIANCES).
//   npm run hw:register -- [--nvs <đường dẫn csv>] [--owner <email>] [--home-name <tên nhà>] [--force]
// Mặc định: --nvs ../firmware/ESP32-S3-Touch-LCD-4.3B-BOX-Demo/ESP-IDF/08_lvgl_Porting/nvs_dev.csv (tính từ thư mục
// backend), --owner user01@smarthome.local, --home-name "Nhà demo phần cứng".
//
// Trên console đã có trang "Đăng ký Gateway" (Admin/Operator, mọi tài khoản khách) cùng mô hình thiết bị — xem
// modules/homes/features/register-gateway. Script này giữ cho thao tác nhanh trên máy dev.
//
// Đây là công cụ DEV, KHÔNG dùng cho production (composition, ngoài quy tắc T1/T2 như seed/): từ chối chạy khi
// NODE_ENV=production (thoát mã 1). Ghi thẳng smart_homes/rooms/smart_home_members/devices trong MỘT transaction
// (invariant 9). Idempotent: chạy lại thì nhà/phòng được dùng lại, thiết bị upsert theo device_id.
// Các hành vi cố ý của công cụ dev:
//   - Ghi đè secret_key trong DB bằng secret trong NVS, đặt lại fail_count = 0 và status = 'active' — thiết bị đang
//     'blocked' sẽ được MỞ KHOÁ (script in một dòng báo từng thiết bị như vậy).
//   - Thiết bị đã thuộc NHÀ KHÁC thì dừng cả transaction (không ghi gì) với thông báo; chỉ chuyển sang nhà này khi
//     truyền --force.
// Bảo mật (invariant 1, 2): secret chỉ đi từ file CSV vào cột devices.secret_key, KHÔNG BAO GIỜ in/log; chỉ in device_id,
// id DB, phòng.
import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { PoolClient } from "pg";
import pool from "../infrastructure/database/pool";
import { queryOne, runSql, withTransaction } from "../infrastructure/database/db";

const DEFAULT_NVS = "../firmware/ESP32-S3-Touch-LCD-4.3B-BOX-Demo/ESP-IDF/08_lvgl_Porting/nvs_dev.csv";
const DEFAULT_OWNER = "user01@smarthome.local";
const DEFAULT_HOME_NAME = "Nhà demo phần cứng";
const MAX_UID_LENGTH = 64;
const MAX_SECRET_LENGTH = 64; // devices.secret_key VARCHAR(64)
const MAX_NODES = 32;

// ── Đọc CSV NVS ────────────────────────────────────────────────────────────

type NvsData = Map<string, Map<string, string>>; // namespace → key → value

/** Tách 1 dòng CSV đơn giản (4 cột; giá trị không chứa dấu phẩy trong file NVS của dự án). */
function parseNvsCsv(text: string): NvsData {
  const data: NvsData = new Map();
  let namespace: Map<string, string> | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("key,")) continue;
    const parts = line.split(",");
    const [key, type] = parts;
    const value = parts.slice(3).join(",");
    if (type === "namespace") {
      namespace = new Map();
      data.set(key, namespace);
    } else if (namespace && key) {
      namespace.set(key, value);
    }
  }
  return data;
}

interface HardwareNode {
  kind: "node" | "camera";
  uid: string;
  secret: string;
}

interface HardwarePlan {
  gateway: { uid: string; secret: string };
  nodes: HardwareNode[];
}

function fail(message: string): never {
  console.error(`[hw:register] ${message}`);
  process.exit(1);
}

function checkUid(label: string, value: string | undefined): string {
  // Không import modules/devices: index của nó kéo theo broker MQTT (đọc CA lúc import) mà script này không cần
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_UID_LENGTH || !/^[A-Za-z0-9_.:-]+$/.test(value)) {
    return fail(`${label}: device_id không hợp lệ (chỉ chữ, số, _ . : -, tối đa ${MAX_UID_LENGTH} ký tự)`);
  }
  if (value.startsWith("REPLACE_WITH")) return fail(`${label}: vẫn là giá trị mẫu REPLACE_WITH_…, hãy điền device_id thật vào NVS`);
  return value;
}

// Không đưa giá trị secret vào thông báo lỗi
function checkSecret(label: string, value: string | undefined): string {
  if (!value || value.length > MAX_SECRET_LENGTH) {
    return fail(`${label}: secret trống hoặc dài quá ${MAX_SECRET_LENGTH} ký tự`);
  }
  if (value.startsWith("REPLACE_WITH")) return fail(`${label}: secret vẫn là giá trị mẫu REPLACE_WITH_…`);
  return value;
}

function buildPlan(data: NvsData): HardwarePlan {
  const identity = data.get("identity");
  const nodes = data.get("nodes");
  if (!identity) return fail("NVS thiếu namespace identity");
  const gateway = {
    uid: checkUid("identity/device_uuid", identity.get("device_uuid")),
    secret: checkSecret("identity/device_secret", identity.get("device_secret")),
  };

  const count = Number(nodes?.get("count") ?? "0");
  if (!nodes || !Number.isInteger(count) || count < 0 || count > MAX_NODES) fail("nodes/count không hợp lệ");
  const result: HardwareNode[] = [];
  for (let i = 0; i < count; i++) {
    const kind = nodes.get(`${i}_kind`);
    if (kind !== "node" && kind !== "camera") fail(`nodes/${i}_kind phải là node hoặc camera`);
    result.push({
      kind,
      uid: checkUid(`nodes/${i}_id`, nodes.get(`${i}_id`)),
      secret: checkSecret(`nodes/${i}_secret`, nodes.get(`${i}_secret`)),
    });
  }
  const uids = [gateway.uid, ...result.map((node) => node.uid)];
  if (new Set(uids).size !== uids.length) fail("device_id bị trùng trong NVS");
  return { gateway, nodes: result };
}

// ── Ghi DB ─────────────────────────────────────────────────────────────────

interface RoomSpec {
  name: string;
  type: string;
  sortOrder: number;
}
const LIVING_ROOM: RoomSpec = { name: "Phòng khách", type: "living_room", sortOrder: 0 };
const CAMERA_ROOM: RoomSpec = { name: "Camera", type: "camera", sortOrder: 1 };
// Bản cũ của script đặt camera vào phòng "Cửa chính" (room_type 'door'): chạy lại thì đổi phòng đó thành CAMERA_ROOM
const LEGACY_CAMERA_ROOM = { name: "Cửa chính", type: "door" };
const CAMERA_NAME = "Camera";
const LEGACY_CAMERA_NAME = "Camera cửa chính";

// Thiết bị điều khiển của phòng khách (màn hình Gateway trang Phòng khách đọc cùng 4 trường lamp/fan/curtain/ac).
// Cả 4 là thiết bị THẬT (is_simulated = FALSE) do Node phòng khách điều khiển: đèn/quạt qua relay HF46F, rèm qua động cơ
// bước, điều hoà qua IR (Node học mã remote rồi phát lại). Lệnh đi MQTT xuống gateway → Node (ESP-NOW, params.target = hậu
// tố), còn trạng thái online/bật-tắt (rèm: mở/đóng)/nhiệt độ đặt đồng bộ từ telemetry của Node (telemetry/ingest-common).
// Chạy lại script trên dữ liệu cũ (đèn/quạt/rèm còn mô phỏng) sẽ chuyển chúng sang thật (upsertAppliance chỉ đổi một chiều).
// device_id = "<id node phòng khách>-<suffix>" và cột devices.appliance = suffix (ingest dựa vào cặp này để tìm thiết bị
// của Node); tên chứa từ khoá ("Đèn", "Quạt", "Rèm", "Điều hòa") để web/mobile chọn đúng kiểu điều khiển.
const LIVING_ROOM_APPLIANCES = [
  { suffix: "lamp", name: "Đèn phòng khách", simulated: false },
  { suffix: "fan", name: "Quạt phòng khách", simulated: false },
  { suffix: "curtain", name: "Rèm cửa phòng khách", simulated: false },
  { suffix: "ac", name: "Điều hòa phòng khách", simulated: false },
] as const;

async function findOwner(conn: PoolClient, email: string): Promise<number> {
  const user = await queryOne<{ id: number }>(
    `SELECT u.id FROM users u JOIN customers c ON c.user_id = u.id
      WHERE LOWER(u.email) = LOWER(?) AND u.role = 'user'`,
    [email],
    conn
  );
  if (!user) return fail("Không tìm thấy khách hàng với email này (cần user role 'user' có hồ sơ customers)");
  return user.id;
}

/** Nhà cùng tên của owner; chưa có thì tạo (KIT_B, đã claim, owner là OWNER) — cùng trạng thái cuối với claim thật. */
async function ensureHome(conn: PoolClient, ownerId: number, name: string): Promise<{ id: number; created: boolean }> {
  const existing = await queryOne<{ id: number }>(
    "SELECT id FROM smart_homes WHERE name = ? AND owner_user_id = ? ORDER BY id LIMIT 1",
    [name, ownerId],
    conn
  );
  if (existing) return { id: existing.id, created: false };

  const home = await runSql(
    `INSERT INTO smart_homes (name, package_code, status, owner_user_id, created_by, claimed_at)
     VALUES (?, 'KIT_B', 'active', ?, ?, NOW())
     RETURNING id`,
    [name, ownerId, ownerId],
    conn
  );
  await runSql(
    "INSERT INTO smart_home_members (home_id, user_id, member_role, accepted_at) VALUES (?, ?, 'OWNER', NOW())",
    [home.insertId, ownerId],
    conn
  );
  return { id: home.insertId, created: true };
}

async function ensureRoom(conn: PoolClient, homeId: number, room: RoomSpec): Promise<number> {
  const existing = await queryOne<{ id: number }>(
    "SELECT id FROM rooms WHERE home_id = ? AND room_type = ? ORDER BY id LIMIT 1",
    [homeId, room.type],
    conn
  );
  if (existing) return existing.id;
  const created = await runSql(
    "INSERT INTO rooms (home_id, name, room_type, sort_order) VALUES (?, ?, ?, ?) RETURNING id",
    [homeId, room.name, room.type, room.sortOrder],
    conn
  );
  return created.insertId;
}

/**
 * Phòng của camera. Nhà đăng ký bằng bản cũ có phòng "Cửa chính" (room_type 'door') chứa camera: đổi phòng đó thành
 * "Camera" (giữ id, thiết bị vẫn trỏ đúng) thay vì tạo thêm phòng. Chỉ đổi khi tên còn đúng tên cũ — phòng khách đã tự
 * đổi tên thì chỉ đổi room_type.
 */
async function ensureCameraRoom(conn: PoolClient, homeId: number): Promise<number> {
  const current = await queryOne<{ id: number }>(
    "SELECT id FROM rooms WHERE home_id = ? AND room_type = ? ORDER BY id LIMIT 1",
    [homeId, CAMERA_ROOM.type],
    conn
  );
  if (current) return current.id;
  // Phòng cửa thật (có cảm biến cửa) thì để nguyên
  const legacy = await queryOne<{ id: number; name: string }>(
    `SELECT r.id, r.name FROM rooms r
      WHERE r.home_id = ? AND r.room_type = ?
        AND NOT EXISTS (SELECT 1 FROM devices d WHERE d.room_id = r.id AND d.category = 'door_contact')
      ORDER BY r.id LIMIT 1`,
    [homeId, LEGACY_CAMERA_ROOM.type],
    conn
  );
  if (legacy) {
    await runSql(
      "UPDATE rooms SET room_type = ?, name = ? WHERE id = ?",
      [CAMERA_ROOM.type, legacy.name === LEGACY_CAMERA_ROOM.name ? CAMERA_ROOM.name : legacy.name, legacy.id],
      conn
    );
    return legacy.id;
  }
  return ensureRoom(conn, homeId, CAMERA_ROOM);
}

interface DeviceSpec {
  uid: string;
  secret: string;
  name: string;
  deviceType: "gateway" | "sensor";
  category: "gateway" | "sensor" | "camera";
  roomId: number | null;
  roomName: string | null;
  gatewayDbId: number | null;
  /** Tên mặc định của bản cũ: thiết bị còn mang đúng tên này thì đổi sang `name` (tên khách tự đặt thì giữ). */
  legacyName?: string;
}

interface DeviceResult {
  uid: string;
  id: number;
  name: string;
  category: string;
  roomName: string | null;
  unblocked: boolean;
}

/** Thiết bị đã thuộc nhà khác và không có --force: ném để withTransaction ROLLBACK cả giao dịch. */
class DeviceInOtherHomeError extends Error {
  constructor(
    readonly uid: string,
    readonly otherHomeId: number
  ) {
    super("Device belongs to another home");
    this.name = "DeviceInOtherHomeError";
  }
}

/**
 * Upsert theo device_id. Thiết bị thật có provision_status 'pending' (sẽ thành 'provisioned' khi nhận số đo/heartbeat đầu
 * tiên). Đã có ở NHÀ KHÁC → DeviceInOtherHomeError (dừng cả transaction) trừ khi `force`.
 */
async function upsertDevice(
  conn: PoolClient,
  homeId: number,
  ownerId: number,
  spec: DeviceSpec,
  force: boolean
): Promise<DeviceResult> {
  const existing = await queryOne<{ id: number; home_id: number | null; status: string }>(
    "SELECT id, home_id, status FROM devices WHERE device_id = ?",
    [spec.uid],
    conn
  );
  if (existing && existing.home_id !== null && existing.home_id !== homeId) {
    if (!force) throw new DeviceInOtherHomeError(spec.uid, existing.home_id);
    console.warn(`[hw:register] --force: ${spec.uid} đang thuộc nhà id=${existing.home_id}, chuyển sang nhà id=${homeId}`);
  }
  const unblocked = existing?.status === "blocked";
  const row = await queryOne<{ id: number; device_name: string }>(
    `INSERT INTO devices
       (device_id, device_name, device_type, secret_key, status, location, fail_count, created_by,
        home_id, room_id, gateway_device_id, category, provision_status, is_simulated)
     VALUES (?, ?, ?, ?, 'active', ?, 0, ?, ?, ?, ?, ?, 'pending', FALSE)
     ON CONFLICT (device_id) DO UPDATE SET
       device_name = CASE WHEN devices.device_name = ? THEN EXCLUDED.device_name ELSE devices.device_name END,
       device_type = EXCLUDED.device_type,
       category = EXCLUDED.category,
       secret_key = EXCLUDED.secret_key,
       location = EXCLUDED.location,
       home_id = EXCLUDED.home_id,
       room_id = EXCLUDED.room_id,
       gateway_device_id = EXCLUDED.gateway_device_id,
       status = 'active',
       fail_count = 0,
       is_simulated = FALSE
     RETURNING id, device_name`,
    [
      spec.uid,
      spec.name,
      spec.deviceType,
      spec.secret,
      spec.roomName,
      ownerId,
      homeId,
      spec.roomId,
      spec.gatewayDbId,
      spec.category,
      spec.legacyName ?? spec.name,
    ],
    conn
  );
  if (!row) throw new Error("Upsert returned no row");
  return { uid: spec.uid, id: row.id, name: row.device_name, category: spec.category, roomName: spec.roomName, unblocked };
}

/** "<node>-<hậu tố>", cắt bớt id node nếu cần để vừa MAX_UID_LENGTH (checkUid đã bảo đảm ký tự hợp lệ). */
function applianceUid(nodeUid: string, suffix: string): string {
  return `${nodeUid.slice(0, MAX_UID_LENGTH - suffix.length - 1)}-${suffix}`;
}

interface ApplianceSpec {
  uid: string;
  /** Hậu tố của uid, đồng thời là giá trị devices.appliance. */
  appliance: (typeof LIVING_ROOM_APPLIANCES)[number]["suffix"];
  /** true = relay mô phỏng (simulator ack); false = thiết bị thật (lệnh đi MQTT). Hiện cả 4 thiết bị đều thật. */
  simulated: boolean;
  name: string;
  roomId: number;
  roomName: string;
  gatewayDbId: number;
}

/**
 * Upsert một relay của phòng khách (LIVING_ROOM_APPLIANCES). Lần đầu: sinh secret ngẫu nhiên (cột NOT NULL, relay không
 * tự ký gì — lệnh ký bằng secret gateway — và secret không bao giờ in ra), power_state = FALSE để UI có công tắc. Chạy lại:
 * giữ secret, tên khách đã đặt, trạng thái bật/tắt và ac_setpoint; gắn lại nhà/phòng/gateway/appliance. Chế độ mô phỏng
 * chỉ đổi một chiều mô phỏng → thật (điều hoà đang mô phỏng từ bản cũ được chuyển sang thật), không bao giờ bật lại mô
 * phỏng cho dòng đã thật. Đã thuộc nhà khác → như upsertDevice.
 */
async function upsertAppliance(
  conn: PoolClient,
  homeId: number,
  ownerId: number,
  spec: ApplianceSpec,
  force: boolean
): Promise<DeviceResult> {
  const existing = await queryOne<{ id: number; home_id: number | null }>(
    "SELECT id, home_id FROM devices WHERE device_id = ?",
    [spec.uid],
    conn
  );
  if (existing && existing.home_id !== null && existing.home_id !== homeId) {
    if (!force) throw new DeviceInOtherHomeError(spec.uid, existing.home_id);
    console.warn(`[hw:register] --force: ${spec.uid} đang thuộc nhà id=${existing.home_id}, chuyển sang nhà id=${homeId}`);
  }
  // Dòng thật (simulated = FALSE) mới tạo có last_seen NULL = offline cho tới khi telemetry của Node cha tới
  const row = await queryOne<{ id: number; device_name: string; is_simulated: boolean }>(
    `INSERT INTO devices
       (device_id, device_name, device_type, secret_key, status, location, fail_count, created_by,
        home_id, room_id, gateway_device_id, category, appliance, power_state, provision_status, is_simulated, sim_online)
     VALUES (?, ?, 'sensor', ?, 'active', ?, 0, ?, ?, ?, ?, 'relay', ?, FALSE, 'provisioned', ?, TRUE)
     ON CONFLICT (device_id) DO UPDATE SET
       category = 'relay',
       appliance = EXCLUDED.appliance,
       is_simulated = CASE WHEN EXCLUDED.is_simulated = FALSE THEN FALSE ELSE devices.is_simulated END,
       location = EXCLUDED.location,
       home_id = EXCLUDED.home_id,
       room_id = EXCLUDED.room_id,
       gateway_device_id = EXCLUDED.gateway_device_id,
       power_state = COALESCE(devices.power_state, FALSE)
     RETURNING id, device_name, is_simulated`,
    [
      spec.uid,
      spec.name,
      crypto.randomBytes(16).toString("hex"),
      spec.roomName,
      ownerId,
      homeId,
      spec.roomId,
      spec.gatewayDbId,
      spec.appliance,
      spec.simulated,
    ],
    conn
  );
  if (!row) throw new Error("Upsert returned no row");
  return {
    uid: spec.uid,
    id: row.id,
    name: row.device_name,
    category: row.is_simulated ? "relay (mô phỏng)" : "relay (thật)",
    roomName: spec.roomName,
    unblocked: false,
  };
}

// ── Main ───────────────────────────────────────────────────────────────────

function argValue(args: string[], name: string, fallback: string): string {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) return fail(`Thiếu giá trị cho ${name}`);
  return value;
}

async function main(): Promise<void> {
  // Công cụ dev: ghi đè secret/mở khoá thiết bị — không bao giờ chạy trên môi trường production
  if (process.env.NODE_ENV === "production") fail("Từ chối chạy: script này chỉ dành cho môi trường dev (NODE_ENV=production)");

  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const nvsPath = path.resolve(argValue(args, "--nvs", DEFAULT_NVS));
  const ownerEmail = argValue(args, "--owner", DEFAULT_OWNER);
  const homeName = argValue(args, "--home-name", DEFAULT_HOME_NAME);

  if (!fs.existsSync(nvsPath)) fail(`Không thấy file NVS: ${nvsPath} (tạo từ nvs_dev.csv.example, hoặc truyền --nvs)`);
  const plan = buildPlan(parseNvsCsv(fs.readFileSync(nvsPath, "utf8")));

  const outcome = await withTransaction(async (conn) => {
    const ownerId = await findOwner(conn, ownerEmail);
    const home = await ensureHome(conn, ownerId, homeName);
    const livingRoomId = await ensureRoom(conn, home.id, LIVING_ROOM);
    const cameraRoomId = plan.nodes.some((node) => node.kind === "camera") ? await ensureCameraRoom(conn, home.id) : null;

    const gateway = await upsertDevice(conn, home.id, ownerId, {
      uid: plan.gateway.uid,
      secret: plan.gateway.secret,
      name: "Gateway S3",
      deviceType: "gateway",
      category: "gateway",
      roomId: null,
      roomName: null,
      gatewayDbId: null,
    }, force);
    const devices: DeviceResult[] = [gateway];
    for (const node of plan.nodes) {
      const isCamera = node.kind === "camera";
      devices.push(
        await upsertDevice(conn, home.id, ownerId, {
          uid: node.uid,
          secret: node.secret,
          name: isCamera ? CAMERA_NAME : "Cảm biến nhiệt/ẩm phòng khách",
          deviceType: "sensor",
          category: isCamera ? "camera" : "sensor",
          roomId: isCamera ? cameraRoomId : livingRoomId,
          roomName: isCamera ? CAMERA_ROOM.name : LIVING_ROOM.name,
          gatewayDbId: gateway.id,
          legacyName: isCamera ? LEGACY_CAMERA_NAME : undefined,
        }, force)
      );
    }
    // Đèn/quạt/rèm/điều hoà gắn với node phòng khách đầu tiên (node kind "node")
    const livingNode = plan.nodes.find((node) => node.kind === "node");
    if (livingNode) {
      for (const appliance of LIVING_ROOM_APPLIANCES) {
        devices.push(
          await upsertAppliance(conn, home.id, ownerId, {
            uid: applianceUid(livingNode.uid, appliance.suffix),
            appliance: appliance.suffix,
            simulated: appliance.simulated,
            name: appliance.name,
            roomId: livingRoomId,
            roomName: LIVING_ROOM.name,
            gatewayDbId: gateway.id,
          }, force)
        );
      }
    }
    return { home, devices };
  });

  console.log(`[hw:register] ${outcome.home.created ? "Đã tạo" : "Dùng lại"} nhà "${homeName}" (home_id=${outcome.home.id}, chủ nhà ${ownerEmail})`);
  for (const device of outcome.devices) {
    console.log(`  - ${device.uid}  id=${device.id}  ${device.category}  phòng: ${device.roomName ?? "(không)"}  "${device.name}"`);
    if (device.unblocked) console.log(`    (đang 'blocked' trước đó — đã mở khoá: status='active', fail_count=0)`);
  }
  console.log(`[hw:register] Nhớ ghi cloud/home_id = ${outcome.home.id} vào NVS gateway để gửi heartbeat/sự kiện camera.`);
}

main()
  .catch((err: unknown) => {
    // Không in err nguyên bản: thông điệp lỗi pg có thể kèm giá trị tham số (secret)
    const code = typeof err === "object" && err !== null && "code" in err ? String((err as { code: unknown }).code) : "";
    if (err instanceof DeviceInOtherHomeError) {
      console.error(
        `[hw:register] Dừng, không ghi gì: ${err.uid} đang thuộc nhà id=${err.otherHomeId}. ` +
          "Nếu đúng là muốn chuyển thiết bị sang nhà này, chạy lại với --force."
      );
      process.exitCode = 1;
      return;
    }
    console.error(`[hw:register] Thất bại${code ? ` (mã ${code})` : ""}: ${err instanceof Error ? err.name : "lỗi không rõ"}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
