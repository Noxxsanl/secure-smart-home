import type { HardwareNodeKind, RegisterGatewayInput } from "@shh/api-client/dashboard";

// Form "Đăng ký Gateway" của console: kiểu dữ liệu, kiểm tra đầu vào (khớp backend
// homes/features/register-gateway) và đọc file NVS (.csv) của gateway ngay trên trình duyệt.

export type NodeRow = {
  /** Khoá React ổn định (không gửi lên server). */
  key: number;
  kind: HardwareNodeKind;
  deviceId: string;
  secret: string;
  roomName: string;
};

export type GatewayForm = {
  homeName: string;
  gatewayId: string;
  gatewaySecret: string;
  nodes: NodeRow[];
};

export const NODE_KIND_LABELS: Record<HardwareNodeKind, string> = {
  node: "Node cảm biến",
  camera: "Camera",
};

export const DEFAULT_ROOM_NAME: Record<HardwareNodeKind, string> = {
  node: "Phòng khách",
  camera: "Camera",
};

export const MAX_NODES = 16;

const UID_PATTERN = /^[A-Za-z0-9_.:-]{1,64}$/;
const SECRET_PATTERN = /^[\x21-\x7E]{8,64}$/;

let nextKey = 1;
export function newNodeRow(kind: HardwareNodeKind, deviceId = "", secret = ""): NodeRow {
  return { key: nextKey++, kind, deviceId, secret, roomName: DEFAULT_ROOM_NAME[kind] };
}

/** Câu lỗi tiếng Việt cho dòng đầu tiên sai, hoặc "" khi hợp lệ. Không bao giờ đưa giá trị secret vào câu lỗi. */
export function validateGatewayForm(form: GatewayForm): string {
  const homeName = form.homeName.trim();
  if (homeName.length < 2 || homeName.length > 128) return "Tên nhà cần từ 2 đến 128 ký tự.";

  const checkIdentity = (label: string, deviceId: string, secret: string): string => {
    const id = deviceId.trim();
    if (!id) return `${label}: nhập Device ID (device_id đã nạp vào chip).`;
    if (!UID_PATTERN.test(id)) return `${label}: Device ID chỉ gồm chữ, số và _ . : - (tối đa 64 ký tự).`;
    if (id.startsWith("REPLACE_WITH")) return `${label}: Device ID vẫn là giá trị mẫu — điền giá trị thật trong NVS.`;
    const key = secret.trim();
    if (!key) return `${label}: nhập Secret (đã nạp vào chip).`;
    if (!SECRET_PATTERN.test(key)) return `${label}: Secret cần 8–64 ký tự, không có khoảng trắng.`;
    if (key.startsWith("REPLACE_WITH")) return `${label}: Secret vẫn là giá trị mẫu — điền giá trị thật trong NVS.`;
    return "";
  };

  const gatewayError = checkIdentity("Gateway", form.gatewayId, form.gatewaySecret);
  if (gatewayError) return gatewayError;

  if (form.nodes.length > MAX_NODES) return `Tối đa ${MAX_NODES} node/camera cho một gateway.`;
  for (const [index, node] of form.nodes.entries()) {
    const label = `${NODE_KIND_LABELS[node.kind]} #${index + 1}`;
    const error = checkIdentity(label, node.deviceId, node.secret);
    if (error) return error;
    if (node.roomName.trim().length > 64) return `${label}: tên phòng tối đa 64 ký tự.`;
  }

  const ids = [form.gatewayId, ...form.nodes.map((node) => node.deviceId)].map((id) => id.trim());
  if (new Set(ids).size !== ids.length) return "Có Device ID bị trùng. Mỗi gateway/node/camera phải có Device ID riêng.";
  return "";
}

export function toRegisterInput(customerId: number, form: GatewayForm, transfer: boolean): RegisterGatewayInput {
  return {
    customer_id: customerId,
    home_name: form.homeName.trim(),
    gateway: { device_id: form.gatewayId.trim(), secret: form.gatewaySecret.trim() },
    nodes: form.nodes.map((node) => ({
      kind: node.kind,
      device_id: node.deviceId.trim(),
      secret: node.secret.trim(),
      room_name: node.roomName.trim() || undefined,
    })),
    transfer: transfer || undefined,
  };
}

// ── File NVS (.csv) của gateway ────────────────────────────────────────────
// Định dạng nvs_partition_gen: "key,type,encoding,value"; dòng type "namespace" mở namespace mới. Chỉ đọc
// identity/device_uuid, identity/device_secret và nodes/{count, <i>_kind, <i>_id, <i>_secret} — bỏ qua mọi namespace
// khác (WiFi, cloud…). File đọc bằng FileReader ngay trên trình duyệt, không tải lên máy chủ.

export type NvsImport = {
  gatewayId: string;
  gatewaySecret: string;
  nodes: { kind: HardwareNodeKind; deviceId: string; secret: string }[];
};

export function parseNvsCsv(text: string): NvsImport | string {
  const namespaces = new Map<string, Map<string, string>>();
  let current: Map<string, string> | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("key,")) continue;
    const parts = line.split(",");
    const [key, type] = parts;
    if (type === "namespace") {
      current = new Map();
      namespaces.set(key, current);
    } else if (current && key) {
      current.set(key, parts.slice(3).join(","));
    }
  }

  const identity = namespaces.get("identity");
  if (!identity?.get("device_uuid") || !identity.get("device_secret")) {
    return "File không có namespace identity (device_uuid, device_secret) của gateway. Chọn đúng file nvs_dev.csv.";
  }
  const nodesNs = namespaces.get("nodes");
  const count = Number(nodesNs?.get("count") ?? "0");
  if (!Number.isInteger(count) || count < 0 || count > MAX_NODES) return "Giá trị nodes/count trong file không hợp lệ.";

  const nodes: NvsImport["nodes"] = [];
  for (let i = 0; i < count; i++) {
    const kind = nodesNs?.get(`${i}_kind`);
    if (kind !== "node" && kind !== "camera") return `nodes/${i}_kind trong file phải là node hoặc camera.`;
    nodes.push({ kind, deviceId: nodesNs?.get(`${i}_id`) ?? "", secret: nodesNs?.get(`${i}_secret`) ?? "" });
  }
  return { gatewayId: identity.get("device_uuid") ?? "", gatewaySecret: identity.get("device_secret") ?? "", nodes };
}
