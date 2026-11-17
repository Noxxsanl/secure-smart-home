// Test parse envelope heartbeat v2 / dạng cũ (hợp đồng A+B §2a) — hàm thuần.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_HEARTBEAT_BODY_RAW_BYTES,
  parseHeartbeatBodyRaw,
  parseHeartbeatEnvelope,
  parseHeartbeatTopic,
} from "./heartbeat";

const HMAC = "5aff042b08f47a9c5cce7cc30f78be93a06cfdf7206de39cf88864f9be4e1cf0";
const BODY = '{"uptime":120,"ip":"192.168.1.50","fw_version":"1.2.3","nodes":[{"device_id":"node-living-01","online":true},{"device_id":"node-x","online":false}]}';

function v2(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ v: 2, ts: 1731700000, ctr: 1731700000123, hmac: HMAC, body_raw: BODY, ...overrides });
}

describe("heartbeat — envelope v2", () => {
  it("nhận v2 đầy đủ, body_raw giữ nguyên văn (chưa parse)", () => {
    const e = parseHeartbeatEnvelope(v2());
    assert.ok(e && e.version === 2);
    assert.equal(e.bodyRaw, BODY);
    assert.equal(e.ctr, 1731700000123);
  });

  it("thiếu/sai kiểu ctr, hmac, ts, body_raw → null", () => {
    assert.equal(parseHeartbeatEnvelope(v2({ ctr: undefined })), null);
    assert.equal(parseHeartbeatEnvelope(v2({ ctr: 0 })), null);
    assert.equal(parseHeartbeatEnvelope(v2({ ctr: "1731700000123" })), null);
    assert.equal(parseHeartbeatEnvelope(v2({ hmac: "abc" })), null);
    assert.equal(parseHeartbeatEnvelope(v2({ ts: 1.5 })), null);
    assert.equal(parseHeartbeatEnvelope(v2({ body_raw: "" })), null);
    assert.equal(parseHeartbeatEnvelope(v2({ body_raw: { uptime: 1 } })), null);
  });

  it("body_raw > 4096 byte bị loại", () => {
    assert.ok(parseHeartbeatEnvelope(v2({ body_raw: "x".repeat(MAX_HEARTBEAT_BODY_RAW_BYTES) })));
    assert.equal(parseHeartbeatEnvelope(v2({ body_raw: "x".repeat(MAX_HEARTBEAT_BODY_RAW_BYTES + 1) })), null);
  });

  it('"v" khác 2 → null; vắng "v" → dạng cũ', () => {
    assert.equal(parseHeartbeatEnvelope(v2({ v: 3 })), null);
    assert.equal(parseHeartbeatEnvelope(v2({ v: "2" })), null);
    const legacy = parseHeartbeatEnvelope(JSON.stringify({ ts: 1731700000, hmac: HMAC, ip: "10.0.0.2", nodes: [] }));
    assert.ok(legacy && legacy.version === 1);
  });

  it("JSON hỏng / không phải object → null", () => {
    assert.equal(parseHeartbeatEnvelope("not json"), null);
    assert.equal(parseHeartbeatEnvelope("[]"), null);
    assert.equal(parseHeartbeatEnvelope("null"), null);
  });
});

describe("heartbeat — body_raw (sau khi chữ ký đúng)", () => {
  it("lấy ip, uptime, node online hợp lệ", () => {
    const b = parseHeartbeatBodyRaw(BODY);
    assert.ok(b);
    assert.equal(b.ip, "192.168.1.50");
    assert.equal(b.uptime, 120);
    assert.deepEqual(b.onlineNodeUids, ["node-living-01"]);
  });

  it("ip lạ bị bỏ, uptime sai kiểu → null; không phải object → null", () => {
    const b = parseHeartbeatBodyRaw('{"ip":"evil\\nip","uptime":"x"}');
    assert.ok(b);
    assert.equal(b.ip, null);
    assert.equal(b.uptime, null);
    assert.equal(parseHeartbeatBodyRaw("[1]"), null);
    assert.equal(parseHeartbeatBodyRaw("{"), null);
  });
});

describe("heartbeat — topic", () => {
  it("home/<id>/gateway/<gw>/heartbeat", () => {
    assert.deepEqual(parseHeartbeatTopic("home/12/gateway/gw-s3-01/heartbeat"), { homeId: 12, gatewayUid: "gw-s3-01" });
    assert.equal(parseHeartbeatTopic("home/12/gateway/gw|bad/heartbeat"), null);
    assert.equal(parseHeartbeatTopic("home/x/gateway/gw-s3-01/heartbeat"), null);
  });
});
