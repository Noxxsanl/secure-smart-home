// POST /api/dashboard/smart-homes/register-gateway — Admin/Operator đăng ký gateway + node/camera thật cho khách.
import type { Request, Response } from "express";
import { getAuth } from "../../../../core/auth/auth-context";
import { requestMeta } from "../../../../core/http/request-meta";
import { HttpError } from "../../../../shared/errors/http-error";
import {
  optionalString,
  requireEnum,
  requireId,
  requireString,
  type StringRule,
} from "../../../../shared/validation/validate";
import {
  DEFAULT_ROOM,
  HARDWARE_NODE_KINDS,
  MAX_HARDWARE_NODES,
  MAX_UID_LENGTH,
} from "../../domain/gateway-registration";
import type { RegisterGatewayInput } from "./register-gateway.dto";
import { registerGateway } from "./register-gateway.handler";

// device_id: cùng tập ký tự với isWellFormedUid của devices (topic MQTT, header camera) — không chèn được dòng log giả
const UID_RULE: StringRule = { max: MAX_UID_LENGTH, pattern: /^[A-Za-z0-9_.:-]+$/ };
// secret HMAC: ký tự ASCII in được, không khoảng trắng; tối đa 64 = devices.secret_key VARCHAR(64)
const SECRET_RULE: StringRule = { min: 8, max: 64, pattern: /^[\x21-\x7E]+$/, trim: false };

function asObject(value: unknown, field: string): Record<string, unknown> {
  if (value === undefined || value === null) throw new HttpError(400, "MISSING_FIELDS", `${field} is required`);
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "INVALID_INPUT", `${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

// Giá trị mẫu của nvs_dev.csv.example chưa được thay. Không đưa giá trị vào thông báo lỗi.
function rejectPlaceholder(value: string, field: string): string {
  if (value.startsWith("REPLACE_WITH")) throw new HttpError(400, "INVALID_INPUT", `${field} is still a placeholder value`);
  return value;
}

function parseIdentity(body: Record<string, unknown>, field: string): { uid: string; secret: string } {
  return {
    uid: rejectPlaceholder(requireString(body.device_id, `${field}.device_id`, UID_RULE), `${field}.device_id`),
    secret: rejectPlaceholder(requireString(body.secret, `${field}.secret`, SECRET_RULE), `${field}.secret`),
  };
}

function parseNodes(value: unknown): RegisterGatewayInput["nodes"] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new HttpError(400, "INVALID_INPUT", "nodes must be an array");
  if (value.length > MAX_HARDWARE_NODES) {
    throw new HttpError(400, "INVALID_INPUT", `nodes must have at most ${MAX_HARDWARE_NODES} items`);
  }
  return value.map((item: unknown, index) => {
    const field = `nodes[${index}]`;
    const body = asObject(item, field);
    const kind = requireEnum(body.kind, `${field}.kind`, HARDWARE_NODE_KINDS);
    return {
      kind,
      ...parseIdentity(body, field),
      roomName: optionalString(body.room_name, `${field}.room_name`, { max: 64 }) ?? DEFAULT_ROOM[kind].name,
    };
  });
}

export async function registerGatewayController(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const input: RegisterGatewayInput = {
    customerId: requireId(body.customer_id, "customer_id"),
    homeName: requireString(body.home_name, "home_name", { min: 2, max: 128 }),
    gateway: parseIdentity(asObject(body.gateway, "gateway"), "gateway"),
    nodes: parseNodes(body.nodes),
    transfer: body.transfer === true,
  };
  res.status(201).json(await registerGateway(getAuth(req), input, requestMeta(req)));
}
