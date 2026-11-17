// Test parse envelope telemetry dùng chung MQTT + HTTP (node:test, không cần DB).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { gatewayUidFromDataTopic, MAX_DATA_RAW_LENGTH, parseDataRaw, parseTelemetryEnvelope } from "./telemetry-envelope";

const HEX = "a".repeat(64);

function v2(overrides: Record<string, unknown> = {}, sensor: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    v: 2,
    gateway_id: "gw-s3-01",
    gw_timestamp: 1731700001,
    gw_hmac: HEX,
    gateway_ip: "192.168.1.50",
    sensor_payload: {
      sensor_id: "node-living-01",
      sn_timestamp: 1731700000,
      sn_ctr: 1731700000123,
      sn_hmac: HEX,
      data_raw: '{"temperature":25.3}',
      ...sensor,
    },
    ...overrides,
  };
}

describe("parseTelemetryEnvelope v2", () => {
  it("gói hợp lệ", () => {
    const result = parseTelemetryEnvelope(v2());
    assert.ok(result.ok);
    assert.equal(result.envelope.version, 2);
    if (result.envelope.version === 2) {
      assert.equal(result.envelope.snCtr, 1731700000123);
      assert.equal(result.envelope.dataRaw, '{"temperature":25.3}');
      assert.equal(result.envelope.gatewayIp, "192.168.1.50");
    }
  });

  it("không có gateway_ip → chuỗi rỗng (đúng chuỗi được ký)", () => {
    const body = v2();
    delete body.gateway_ip;
    const result = parseTelemetryEnvelope(body);
    assert.ok(result.ok && result.envelope.version === 2 && result.envelope.gatewayIp === "");
  });

  it("thiếu / sai sn_ctr → MISSING_SENSOR_FIELDS", () => {
    for (const snCtr of [undefined, 0, -1, 1.5, "123", 2 ** 53]) {
      const result = parseTelemetryEnvelope(v2({}, { sn_ctr: snCtr }));
      assert.ok(!result.ok && result.error === "MISSING_SENSOR_FIELDS", `sn_ctr=${String(snCtr)}`);
    }
  });

  it("UID có ký tự '|' (phá chuỗi ký) hoặc xuống dòng → bị từ chối", () => {
    assert.ok(!parseTelemetryEnvelope(v2({ gateway_id: "gw|x" })).ok);
    assert.ok(!parseTelemetryEnvelope(v2({}, { sensor_id: "node\nfake" })).ok);
  });

  it("hmac không phải 64 hex → từ chối", () => {
    assert.ok(!parseTelemetryEnvelope(v2({ gw_hmac: "abc" })).ok);
    assert.ok(!parseTelemetryEnvelope(v2({}, { sn_hmac: "g".repeat(64) })).ok);
  });

  it("data_raw phải là chuỗi, không quá giới hạn", () => {
    assert.ok(!parseTelemetryEnvelope(v2({}, { data_raw: { temperature: 1 } })).ok);
    assert.ok(!parseTelemetryEnvelope(v2({}, { data_raw: "x".repeat(MAX_DATA_RAW_LENGTH + 1) })).ok);
  });

  it("gateway_ip sai định dạng → INVALID_PAYLOAD", () => {
    const result = parseTelemetryEnvelope(v2({ gateway_ip: "1.2.3.4|x" }));
    assert.ok(!result.ok && result.error === "INVALID_PAYLOAD");
  });

  it("phiên bản lạ → INVALID_PAYLOAD", () => {
    const result = parseTelemetryEnvelope(v2({ v: 3 }));
    assert.ok(!result.ok && result.error === "INVALID_PAYLOAD");
  });
});

describe("parseTelemetryEnvelope v1 (chỉ nhận khi DEVICE_HMAC_V1=true)", () => {
  it("không có trường v → v1", () => {
    const result = parseTelemetryEnvelope({
      gateway_id: "gw-s3-01",
      gw_timestamp: 1731700001,
      gw_hmac: HEX,
      sensor_payload: { sensor_id: "node-living-01", sn_timestamp: 1731700000, sn_hmac: HEX, data: { temperature: 1 } },
    });
    assert.ok(result.ok && result.envelope.version === 1);
  });

  it("thiếu trường gateway → MISSING_GATEWAY_FIELDS", () => {
    const result = parseTelemetryEnvelope({ gateway_id: "gw" });
    assert.ok(!result.ok && result.error === "MISSING_GATEWAY_FIELDS");
  });
});

describe("parseDataRaw / topic", () => {
  it("chỉ nhận JSON object", () => {
    assert.deepEqual(parseDataRaw('{"a":1}'), { a: 1 });
    assert.equal(parseDataRaw("[1,2]"), null);
    assert.equal(parseDataRaw("null"), null);
    assert.equal(parseDataRaw("{bad"), null);
  });

  it("gateway/<gw>/data", () => {
    assert.equal(gatewayUidFromDataTopic("gateway/gw-s3-01/data"), "gw-s3-01");
    assert.equal(gatewayUidFromDataTopic("gateway/gw-s3-01/data/x"), null);
    assert.equal(gatewayUidFromDataTopic("home/1/gateway/gw/data"), null);
  });
});
