// Xoay vòng credential của phần cứng thật (6.1 "Cấp phát / xoay vòng"): sinh secret HMAC và khoá ESP-NOW (LMK) MỚI bằng
// CSPRNG rồi ghi vào các file NVS CSV (gitignore) của Gateway, Node, Camera — không còn secret do người tự đặt.
//
//   npm run hw:rotate -- [--what secrets|lmk|all] [--only <device_id>] [--nvs <csv gateway>]
//                        [--node-nvs <csv node> ...] [--camera-nvs <csv camera> ...]
//
// Mặc định: --what secrets, mọi thiết bị trong CSV gateway; đường dẫn mặc định như hw:register (tính từ thư mục backend).
//   secrets: identity/device_secret của gateway, node (CSV node), camera (CSV camera + nodes/<i>_secret của gateway — 2
//            bên phải khớp vì Gateway ↔ Camera xác thực cục bộ). Xoá nodes/<i>_secret của NODE khỏi CSV gateway (Gateway
//            không còn giữ secret Node).
//   lmk:     khoá ESP-NOW 16 byte: pairing/session_key của node/camera = nodes/<i>_lmk của gateway.
// Thiết bị nào thiếu CSV bên kia thì bỏ qua (không đổi một phía). Mỗi file sửa có bản sao <file>.bak-<thời điểm>.
// Sau đó: tạo lại nvs_dev.bin + nạp NVS cho các board liên quan, rồi `npm run hw:register` để DB nhận secret mới
// (đặt lại bộ đếm chống phát lại). Thu hồi chứng chỉ MQTT của gateway: infra/pki/gen_mqtt_client.sh --revoke <id>.
//
// Công cụ DEV (không dùng DB, từ chối khi NODE_ENV=production). KHÔNG BAO GIỜ in secret/LMK (bất biến 2) — chỉ in device_id.
import crypto from "crypto";
import fs from "fs";
import path from "path";

const DEFAULT_GATEWAY_NVS = "../firmware/ESP32-S3-Touch-LCD-4.3B-BOX-Demo/ESP-IDF/08_lvgl_Porting/nvs_dev.csv";
const DEFAULT_NODE_NVS = "../firmware/esp32_s3_firmware_node/nvs_dev.csv";
const DEFAULT_CAMERA_NVS = "../firmware/esp32_cam/nvs_dev.csv";

type What = "secrets" | "lmk" | "all";

function fail(message: string): never {
  console.error(`[hw:rotate] ${message}`);
  process.exit(1);
}

/** File NVS CSV giữ nguyên thứ tự dòng và kiểu xuống dòng; chỉ thay cột value của (namespace, key). */
class NvsCsv {
  private readonly lines: string[];
  private readonly eol: string;
  changed = false;

  constructor(readonly file: string) {
    const text = fs.readFileSync(file, "utf8");
    this.eol = text.includes("\r\n") ? "\r\n" : "\n";
    this.lines = text.split(/\r?\n/);
  }

  /** Duyệt các dòng dữ liệu: (chỉ số dòng, namespace, key, value). */
  private *entries(): Generator<{ index: number; ns: string; key: string; value: string }> {
    let ns = "";
    for (let index = 0; index < this.lines.length; index++) {
      const line = this.lines[index].trim();
      if (!line || line.startsWith("#") || line.startsWith("key,")) continue;
      const parts = line.split(",");
      if (parts[1] === "namespace") {
        ns = parts[0];
        continue;
      }
      yield { index, ns, key: parts[0], value: parts.slice(3).join(",") };
    }
  }

  get(ns: string, key: string): string | undefined {
    for (const entry of this.entries()) if (entry.ns === ns && entry.key === key) return entry.value;
    return undefined;
  }

  set(ns: string, key: string, value: string): boolean {
    for (const entry of this.entries()) {
      if (entry.ns !== ns || entry.key !== key) continue;
      const parts = this.lines[entry.index].split(",");
      this.lines[entry.index] = [...parts.slice(0, 3), value].join(",");
      this.changed = true;
      return true;
    }
    return false;
  }

  remove(ns: string, key: string): boolean {
    for (const entry of this.entries()) {
      if (entry.ns !== ns || entry.key !== key) continue;
      this.lines.splice(entry.index, 1);
      this.changed = true;
      return true;
    }
    return false;
  }

  save(stamp: string): void {
    if (!this.changed) return;
    // Bản sao chứa secret CŨ — chỉ chủ file đọc được
    fs.writeFileSync(`${this.file}.bak-${stamp}`, fs.readFileSync(this.file), { mode: 0o600 });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, this.lines.join(this.eol), { encoding: "utf8", mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }
}

function argValues(args: string[], name: string): string[] {
  const values: string[] = [];
  args.forEach((arg, index) => {
    if (arg !== name) return;
    const value = args[index + 1];
    if (!value || value.startsWith("--")) fail(`Thiếu giá trị cho ${name}`);
    values.push(value);
  });
  return values;
}

/** CSV của thiết bị theo identity/device_uuid (bỏ qua file không tồn tại). */
function loadByUid(paths: readonly string[]): Map<string, NvsCsv> {
  const result = new Map<string, NvsCsv>();
  for (const file of paths.map((p) => path.resolve(p))) {
    if (!fs.existsSync(file)) continue;
    const csv = new NvsCsv(file);
    const uid = csv.get("identity", "device_uuid");
    if (uid) result.set(uid, csv);
  }
  return result;
}

const newSecret = (): string => crypto.randomBytes(32).toString("hex");
const newLmk = (): string => crypto.randomBytes(16).toString("hex");

function main(): void {
  if (process.env.NODE_ENV === "production") fail("Từ chối chạy: công cụ dev (NODE_ENV=production)");
  const args = process.argv.slice(2);
  const what = (argValues(args, "--what")[0] ?? "secrets") as What;
  if (!["secrets", "lmk", "all"].includes(what)) fail("--what phải là secrets | lmk | all");
  const only = argValues(args, "--only")[0] ?? null;
  const gatewayFile = path.resolve(argValues(args, "--nvs")[0] ?? DEFAULT_GATEWAY_NVS);
  if (!fs.existsSync(gatewayFile)) fail(`Không thấy CSV gateway: ${gatewayFile} (truyền --nvs)`);

  const nodePaths = argValues(args, "--node-nvs");
  const cameraPaths = argValues(args, "--camera-nvs");
  const gateway = new NvsCsv(gatewayFile);
  const nodeCsvs = loadByUid(nodePaths.length > 0 ? nodePaths : [DEFAULT_NODE_NVS]);
  const cameraCsvs = loadByUid(cameraPaths.length > 0 ? cameraPaths : [DEFAULT_CAMERA_NVS]);
  const rotateSecrets = what !== "lmk";
  const rotateLmk = what !== "secrets";
  const done: string[] = [];
  const skipped: string[] = [];

  const gatewayUid = gateway.get("identity", "device_uuid");
  if (!gatewayUid) fail("CSV gateway thiếu identity/device_uuid");
  if (rotateSecrets && (only === null || only === gatewayUid)) {
    gateway.set("identity", "device_secret", newSecret());
    done.push(`${gatewayUid} (gateway): secret`);
  }

  const count = Number(gateway.get("nodes", "count") ?? "0");
  for (let i = 0; i < count; i++) {
    const uid = gateway.get("nodes", `${i}_id`);
    const kind = gateway.get("nodes", `${i}_kind`);
    if (!uid || (kind !== "node" && kind !== "camera")) continue;
    if (only !== null && only !== uid) continue;
    const own = (kind === "node" ? nodeCsvs : cameraCsvs).get(uid);
    if (!own) {
      skipped.push(`${uid} (${kind}): không thấy CSV của thiết bị — truyền --${kind === "node" ? "node" : "camera"}-nvs`);
      continue;
    }
    const parts: string[] = [];
    if (rotateSecrets) {
      const secret = newSecret();
      if (!own.set("identity", "device_secret", secret)) {
        // Không đổi một phía: camera thiếu dòng thì gateway giữ secret cũ (2 bên vẫn khớp)
        skipped.push(`${uid}: CSV thiếu identity/device_secret — không đổi secret`);
      } else {
        if (kind === "camera") {
          gateway.set("nodes", `${i}_secret`, secret);
        } else if (gateway.remove("nodes", `${i}_secret`)) {
          parts.push("đã xoá secret Node khỏi CSV gateway");
        }
        parts.unshift("secret");
      }
    }
    if (rotateLmk) {
      const lmk = newLmk();
      const ownOk = own.set("pairing", "session_key", lmk);
      const gwOk = gateway.set("nodes", `${i}_lmk`, lmk);
      if (ownOk && gwOk) parts.push("LMK");
      else skipped.push(`${uid}: thiếu pairing/session_key hoặc nodes/${i}_lmk — không đổi LMK`);
    }
    if (parts.length > 0) done.push(`${uid} (${kind}): ${parts.join(", ")}`);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  gateway.save(stamp);
  for (const csv of [...nodeCsvs.values(), ...cameraCsvs.values()]) csv.save(stamp);

  console.log(`[hw:rotate] Đã sinh giá trị mới (không in ra):`);
  for (const line of done) console.log(`  - ${line}`);
  for (const line of skipped) console.warn(`  ! ${line}`);
  console.log("[hw:rotate] Tiếp theo:");
  console.log("  1. Tạo lại nvs_dev.bin và nạp NVS cho mọi board vừa đổi (README từng firmware, mục Nạp NVS).");
  console.log("  2. cd backend && npm run hw:register  — DB nhận secret mới, đặt lại bộ đếm chống phát lại.");
  console.log("  3. Bản sao cũ: <file>.bak-<thời điểm> (chứa secret cũ — xoá khi đã nạp xong).");
}

main();
