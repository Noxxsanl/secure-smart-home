// Parse envelope telemetry của gateway — DÙNG CHUNG cho đường MQTT (gateway/<gw>/data) và HTTP (POST /api/device/data)
// (invariant 4). Hàm THUẦN: chỉ kiểm hình dạng/kiểu, không xác thực chữ ký (domain/ingest-auth.ts làm việc đó).
//
// v2 (API_DESIGN §3, §9.1):
//   {"v":2,"gateway_id","gw_timestamp","gw_hmac","gateway_ip"?,
//    "sensor_payload":{"sensor_id","sn_timestamp","sn_ctr","sn_hmac","data_raw":"<chuỗi JSON nguyên văn Node đã ký>"}}
// v1 (không có "v"; chỉ nhận khi DEVICE_HMAC_V1=true):
//   {"gateway_id","gw_timestamp","gw_hmac","gateway_ip"?,"sensor_payload":{"sensor_id","sn_timestamp","sn_hmac","data":{…},"sensor_ip"?}}
import {
  isDeviceIp,
  isHmacHex,
  isSafeDeviceId,
  isUnixSeconds,
  isValidCounter,
  isWellFormedUid,
} from "../../../shared/validation/device-input";

/** data_raw tối đa 2 KB — Node gửi < 120 byte trong một khung ESP-NOW; chặn body phình qua đường HTTP. */
export const MAX_DATA_RAW_LENGTH = 2048;

export interface TelemetryEnvelopeV2 {
  version: 2;
  gatewayId: string;
  gwTimestamp: number;
  gwHmac: string;
  /** "" khi gateway không báo IP — đúng chuỗi được ký. */
  gatewayIp: string;
  sensorId: string;
  snTimestamp: number;
  snCtr: number;
  snHmac: string;
  dataRaw: string;
}

export interface TelemetryEnvelopeV1 {
  version: 1;
  gatewayId: string;
  gwTimestamp: number;
  gwHmac: string;
  gatewayIp: string | null;
  sensorId: string;
  snTimestamp: number;
  snHmac: string;
  data: unknown;
  sensorIp: string | null;
}

export type TelemetryEnvelope = TelemetryEnvelopeV1 | TelemetryEnvelopeV2;

export type EnvelopeParseError = "MISSING_GATEWAY_FIELDS" | "MISSING_SENSOR_FIELDS" | "INVALID_PAYLOAD";

export type EnvelopeParseResult =
  | { ok: true; envelope: TelemetryEnvelope }
  | { ok: false; error: EnvelopeParseError; detail: string };

function fail(error: EnvelopeParseError, detail: string): EnvelopeParseResult {
  return { ok: false, error, detail };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function parseV2(body: Record<string, unknown>): EnvelopeParseResult {
  const { gateway_id, gw_timestamp, gw_hmac, gateway_ip } = body;
  if (!isWellFormedUid(gateway_id) || !isUnixSeconds(gw_timestamp) || !isHmacHex(gw_hmac)) {
    return fail("MISSING_GATEWAY_FIELDS", "gateway_id, gw_timestamp and gw_hmac (64 hex) are required");
  }
  if (gateway_ip !== undefined && gateway_ip !== "" && !isDeviceIp(gateway_ip)) {
    return fail("INVALID_PAYLOAD", "gateway_ip must be an IP address");
  }
  const sensor = asRecord(body.sensor_payload);
  if (!sensor) return fail("MISSING_SENSOR_FIELDS", "sensor_payload object is required");
  const { sensor_id, sn_timestamp, sn_ctr, sn_hmac, data_raw } = sensor;
  if (!isWellFormedUid(sensor_id) || !isUnixSeconds(sn_timestamp) || !isValidCounter(sn_ctr) || !isHmacHex(sn_hmac)) {
    return fail("MISSING_SENSOR_FIELDS", "sensor_id, sn_timestamp, sn_ctr and sn_hmac (64 hex) are required");
  }
  if (typeof data_raw !== "string" || data_raw.length < 2 || data_raw.length > MAX_DATA_RAW_LENGTH) {
    return fail("INVALID_PAYLOAD", `data_raw must be a JSON object string of at most ${MAX_DATA_RAW_LENGTH} characters`);
  }
  return {
    ok: true,
    envelope: {
      version: 2,
      gatewayId: gateway_id,
      gwTimestamp: gw_timestamp,
      gwHmac: gw_hmac,
      gatewayIp: typeof gateway_ip === "string" ? gateway_ip : "",
      sensorId: sensor_id,
      snTimestamp: sn_timestamp,
      snCtr: sn_ctr,
      snHmac: sn_hmac,
      dataRaw: data_raw,
    },
  };
}

/** v1: giữ nguyên quy tắc đầu vào của bản cũ (Number(...) cho timestamp, chuỗi bất kỳ cho hmac — verify sẽ từ chối). */
function parseV1(body: Record<string, unknown>): EnvelopeParseResult {
  const { gateway_id, gw_timestamp, gw_hmac, gateway_ip } = body;
  if (!isSafeDeviceId(gateway_id) || !gw_timestamp || typeof gw_hmac !== "string" || !gw_hmac) {
    return fail("MISSING_GATEWAY_FIELDS", "gateway_id, gw_timestamp and gw_hmac are required");
  }
  const sensor = asRecord(body.sensor_payload);
  const sensorId = sensor?.sensor_id;
  if (!sensor || !isSafeDeviceId(sensorId) || !sensor.sn_timestamp || typeof sensor.sn_hmac !== "string" || !sensor.sn_hmac) {
    return fail("MISSING_SENSOR_FIELDS", "sensor_payload with sensor_id, sn_timestamp and sn_hmac is required");
  }
  return {
    ok: true,
    envelope: {
      version: 1,
      gatewayId: gateway_id,
      gwTimestamp: Number(gw_timestamp),
      gwHmac: gw_hmac,
      gatewayIp: typeof gateway_ip === "string" && gateway_ip ? gateway_ip : null,
      sensorId,
      snTimestamp: Number(sensor.sn_timestamp),
      snHmac: sensor.sn_hmac,
      data: sensor.data,
      sensorIp: typeof sensor.sensor_ip === "string" && sensor.sensor_ip ? sensor.sensor_ip : null,
    },
  };
}

export function parseTelemetryEnvelope(body: unknown): EnvelopeParseResult {
  const record = asRecord(body);
  if (!record) return fail("MISSING_GATEWAY_FIELDS", "body must be a JSON object");
  if (record.v === undefined) return parseV1(record);
  if (record.v === 2) return parseV2(record);
  return fail("INVALID_PAYLOAD", "unsupported envelope version");
}

/**
 * data_raw → object số đo. Chuỗi phải là JSON object (không phải mảng/null/số) — Node chỉ ký object phẳng.
 * null nếu sai định dạng.
 */
export function parseDataRaw(dataRaw: string): Record<string, unknown> | null {
  try {
    return asRecord(JSON.parse(dataRaw));
  } catch {
    return null;
  }
}

/** UID gateway trên topic "gateway/<gw>/data"; null nếu topic sai dạng. */
export function gatewayUidFromDataTopic(topic: string): string | null {
  const parts = topic.split("/");
  if (parts.length !== 3 || parts[0] !== "gateway" || parts[2] !== "data") return null;
  return isWellFormedUid(parts[1]) ? parts[1] : null;
}
