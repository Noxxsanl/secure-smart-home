// Xác thực một gói telemetry — MỘT hàm cho cả đường MQTT (features/ingest-mqtt) và HTTP (features/ingest-http)
// (invariant 4). Thứ tự kiểm:
//   1. parse envelope (domain/telemetry-envelope.ts) → 400
//   2. MQTT: gateway_id trong payload phải trùng gateway trên topic (topic do broker cưỡng chế bằng mTLS + ACL) → 401
//   3. v1 khi DEVICE_HMAC_V1 tắt → 401 PROTOCOL_V1_DISABLED
//   4. chữ ký gateway (v2: phủ sn_hmac + sensor_id + ctr + gateway_ip) → 401 GATEWAY_AUTH_FAIL
//   5. chữ ký node (v2: phủ sha256(data_raw) + ctr; secret node Gateway KHÔNG giữ) → 401 SENSOR_AUTH_FAIL
//   6. loại thiết bị (gateway/sensor) → 403 INVALID_DEVICE_TYPE; node phải thuộc chính gateway này → 403 SENSOR_GATEWAY_MISMATCH
//   7. data (v2: JSON.parse(data_raw)) → 400
//   8. v2: ctr trong khoảng + lớn hơn last_ctr (UPDATE nguyên tử) → 401 SENSOR_AUTH_FAIL REPLAYED
//
// Chính sách khoá thiết bị (FR-12.2, chống DoS): chỉ lỗi HMAC_MISMATCH QUY ĐƯỢC cho một bên đã xác thực mới tăng
// fail_count — tức gói tới qua MQTT: người gửi đã qua mTLS và ACL chỉ cho publish gateway/<CN của chính nó>/data, nên
// chữ ký gateway hay chữ ký node sai là do chính gateway đó (lỗi/bị chiếm). Trên HTTP (ai cũng POST được qua nginx) kẻ
// tấn công có thể gửi lại một chữ ký gateway hợp lệ kèm data đã sửa → KHÔNG tính, chỉ ghi audit; tần suất do rate limit
// theo IP (core/http/rate-limit.ts) chặn. Lệch giờ, gói phát lại, v1 bị tắt không bao giờ làm khoá thiết bị.
import { env } from "../../../config/env";
import { log } from "../../audit";
import {
  claimDeviceCounter,
  isCounterInRange,
  isWellFormedUid,
  jsonHasNul,
  registerAuthFailure,
  verifyDeviceHMAC,
  verifyGatewayHMAC,
  verifyGatewayTelemetryV2,
  verifySensorTelemetryV2,
} from "../../devices";
import type { HMACVerifyResult, VerifiedDevice } from "../../devices";
import { authFailureEventType } from "./ingest-common";
import { parseDataRaw, parseTelemetryEnvelope, type TelemetryEnvelope } from "./telemetry-envelope";

export interface TelemetryAuthContext {
  source: "mqtt" | "http";
  /** MQTT: UID gateway trên topic gateway/<gw>/data (null nếu topic sai dạng). HTTP: bỏ trống. */
  topicGatewayUid?: string | null;
  ip: string | null;
  userAgent: string | null;
}

export interface AuthenticatedTelemetry {
  version: 1 | 2;
  gateway: VerifiedDevice;
  sensor: VerifiedDevice;
  data: Record<string, unknown>;
  /** JSON.stringify(data) — đã kiểm không có \u0000 (JSONB). */
  dataJson: string;
  /** IP do firmware tự báo (null nếu không có). */
  gatewayIp: string | null;
  sensorIp: string | null;
}

export interface TelemetryRejection {
  status: number;
  error: string;
  reason?: string;
  detail?: string;
}

export type TelemetryAuthResult = { ok: true; telemetry: AuthenticatedTelemetry } | { ok: false; rejection: TelemetryRejection };

function reject(status: number, error: string, reason?: string, detail?: string): TelemetryAuthResult {
  return { ok: false, rejection: { status, error, ...(reason ? { reason } : {}), ...(detail ? { detail } : {}) } };
}

function audit(eventType: string, deviceDbId: number | null, ctx: TelemetryAuthContext, details: Record<string, unknown>): Promise<void> {
  return log(eventType, deviceDbId, ctx.ip, ctx.userAgent, { ...details, source: ctx.source });
}

/** Lỗi chữ ký có được tính vào fail_count không (xem chính sách ở đầu file). */
function countsTowardBlock(result: HMACVerifyResult, attributable: boolean): boolean {
  return attributable && result.error === "HMAC_MISMATCH";
}

async function countFailure(device: VerifiedDevice, ctx: TelemetryAuthContext): Promise<void> {
  const { failCount, blocked } = await registerAuthFailure(device.id);
  if (blocked) {
    await audit("DEVICE_BLOCKED", device.id, ctx, { device_id: device.device_id, fail_count: failCount });
    console.warn(`[ingest] blocked ${device.device_id} (fail_count=${failCount})`);
  }
}

// Gói v1 khi đã tắt v1: firmware cũ gửi mỗi ~10 s → chỉ cảnh báo 1 lần / gateway / 10 phút, không ghi audit_log.
const V1_WARN_INTERVAL_MS = 10 * 60 * 1000;
const v1Warned = new Map<string, number>();
function warnV1(rawGatewayId: string): void {
  // v1 chỉ kiểm "không có NUL" — không in nguyên giá trị lạ (chống chèn dòng log) và không để nó phình map
  const gatewayId = isWellFormedUid(rawGatewayId) ? rawGatewayId : "?";
  const now = Date.now();
  const last = v1Warned.get(gatewayId);
  if (last !== undefined && now - last < V1_WARN_INTERVAL_MS) return;
  v1Warned.set(gatewayId, now);
  if (v1Warned.size > 1000) v1Warned.clear();
  console.warn(
    `[ingest] ${gatewayId}: telemetry chữ ký v1 bị từ chối — nạp firmware v2 cho Gateway/Node (hoặc tạm đặt DEVICE_HMAC_V1=true)`
  );
}

function verifyGateway(envelope: TelemetryEnvelope): Promise<HMACVerifyResult> {
  if (envelope.version === 2) {
    return verifyGatewayTelemetryV2(
      {
        gatewayId: envelope.gatewayId,
        gwTimestamp: envelope.gwTimestamp,
        gatewayIp: envelope.gatewayIp,
        sensorId: envelope.sensorId,
        snCtr: envelope.snCtr,
        snHmac: envelope.snHmac,
      },
      envelope.gwHmac
    );
  }
  return verifyGatewayHMAC(envelope.gatewayId, envelope.gwTimestamp, envelope.gwHmac);
}

function verifySensor(envelope: TelemetryEnvelope): Promise<HMACVerifyResult> {
  if (envelope.version === 2) {
    return verifySensorTelemetryV2(
      { sensorId: envelope.sensorId, snTimestamp: envelope.snTimestamp, snCtr: envelope.snCtr, dataRaw: envelope.dataRaw },
      envelope.snHmac
    );
  }
  return verifyDeviceHMAC(envelope.sensorId, envelope.snTimestamp, envelope.snHmac);
}

export async function authenticateTelemetry(body: unknown, ctx: TelemetryAuthContext): Promise<TelemetryAuthResult> {
  const parsed = parseTelemetryEnvelope(body);
  if (!parsed.ok) return reject(400, parsed.error, undefined, parsed.detail);
  const envelope = parsed.envelope;

  if (ctx.source === "mqtt" && envelope.gatewayId !== ctx.topicGatewayUid) {
    await audit("GATEWAY_AUTH_FAIL", null, ctx, {
      gateway_id: envelope.gatewayId,
      topic_gateway_id: ctx.topicGatewayUid ?? null,
      reason: "TOPIC_MISMATCH",
    });
    return reject(401, "GATEWAY_AUTH_FAIL", "TOPIC_MISMATCH");
  }

  if (envelope.version === 1 && !env.deviceHmacV1) {
    warnV1(envelope.gatewayId);
    return reject(401, "GATEWAY_AUTH_FAIL", "PROTOCOL_V1_DISABLED", "Signature v1 is disabled — flash firmware v2");
  }

  // ── Lớp gateway ──
  const gw = await verifyGateway(envelope);
  if (!gw.ok || !gw.device) {
    await audit(authFailureEventType("gateway", gw.error), gw.device?.id ?? null, ctx, {
      gateway_id: envelope.gatewayId,
      reason: gw.error,
    });
    if (gw.device && countsTowardBlock(gw, ctx.source === "mqtt")) await countFailure(gw.device, ctx);
    return reject(401, "GATEWAY_AUTH_FAIL", gw.error);
  }

  // ── Lớp node (chữ ký end-to-end của Node, Gateway không giữ secret) ──
  const sn = await verifySensor(envelope);
  if (!sn.ok || !sn.device) {
    await audit(authFailureEventType("sensor", sn.error), sn.device?.id ?? null, ctx, {
      sensor_id: envelope.sensorId,
      gateway_id: envelope.gatewayId,
      reason: sn.error,
    });
    // Chỉ tính cho node CỦA CHÍNH gateway này: gateway A (mTLS hợp lệ) gửi sensor_id của node nhà B kèm chữ ký rác
    // không được làm khoá node nhà B (tách tenant, bất biến 6).
    if (sn.device && sn.device.gateway_device_id === gw.device.id && countsTowardBlock(sn, ctx.source === "mqtt")) {
      await countFailure(sn.device, ctx);
    }
    return reject(401, "SENSOR_AUTH_FAIL", sn.error);
  }
  const gateway = gw.device;
  const sensor = sn.device;

  // ── Loại thiết bị + quan hệ gateway → node ──
  if (gateway.device_type !== "gateway") {
    await audit("PRIVILEGE_ESCALATION", gateway.id, ctx, {
      gateway_id: gateway.device_id,
      actual_type: gateway.device_type,
      reason: "device_type_not_gateway",
    });
    return reject(403, "INVALID_DEVICE_TYPE", undefined, "gateway_id must be a gateway device");
  }
  if (sensor.device_type !== "sensor") {
    await audit("PRIVILEGE_ESCALATION", sensor.id, ctx, {
      sensor_id: sensor.device_id,
      actual_type: sensor.device_type,
      reason: "device_type_not_sensor",
    });
    return reject(403, "INVALID_DEVICE_TYPE", undefined, "sensor_id must be a sensor device");
  }
  if (sensor.gateway_device_id !== gateway.id) {
    await audit("SENSOR_GATEWAY_MISMATCH", sensor.id, ctx, {
      sensor_id: sensor.device_id,
      gateway_id: gateway.device_id,
    });
    return reject(403, "SENSOR_GATEWAY_MISMATCH", undefined, "sensor is not paired with this gateway");
  }

  // ── Số đo ──
  const data = envelope.version === 2 ? parseDataRaw(envelope.dataRaw) : asObject(envelope.data);
  if (!data) {
    return reject(400, "MISSING_PAYLOAD_DATA", undefined, "sensor_payload must carry a JSON object (data_raw / data)");
  }
  const dataJson = JSON.stringify(data);
  if (jsonHasNul(dataJson)) {
    return reject(400, "MISSING_PAYLOAD_DATA", undefined, "data must not contain NUL characters");
  }

  // ── Chống phát lại (v2) ──
  if (envelope.version === 2) {
    if (!isCounterInRange(envelope.snCtr)) {
      await audit("REPLAY_ATTACK", sensor.id, ctx, { sensor_id: sensor.device_id, reason: "COUNTER_OUT_OF_RANGE" });
      return reject(401, "SENSOR_AUTH_FAIL", "COUNTER_OUT_OF_RANGE");
    }
    if (!(await claimDeviceCounter(sensor.id, envelope.snCtr))) {
      await audit("REPLAY_ATTACK", sensor.id, ctx, {
        sensor_id: sensor.device_id,
        gateway_id: gateway.device_id,
        reason: "REPLAYED",
        sn_ctr: envelope.snCtr,
      });
      return reject(401, "SENSOR_AUTH_FAIL", "REPLAYED");
    }
  }

  return {
    ok: true,
    telemetry: {
      version: envelope.version,
      gateway,
      sensor,
      data,
      dataJson,
      gatewayIp: envelope.version === 2 ? envelope.gatewayIp || null : envelope.gatewayIp,
      sensorIp: envelope.version === 2 ? null : envelope.sensorIp,
    },
  };
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
