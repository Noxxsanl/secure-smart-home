// Test chữ ký telemetry v2 (node:test, không cần DB). Vector cố định ở đây cũng là hợp đồng cho firmware
// (firmware/common/security_manager sm_*_v2) và tests/security/attack_demo.sh: đổi định dạng chuỗi ký = đổi test này.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sha256Hex } from "../../../shared/crypto";
import {
  COUNTER_MAX_AHEAD_MS,
  ackMessageV2,
  cameraEventMessageV2,
  gatewayMessageV2,
  heartbeatMessageV2,
  isCounterInRange,
  sensorMessageV2,
  signMessage,
  verifyMessage,
} from "./signature-v2";

const NODE_SECRET = "node-secret-for-test-only-0123456789abcdef0123456789abcdef";
const GW_SECRET = "gateway-secret-for-test-only-0123456789abcdef0123456789abcd";
const DATA_RAW = '{"temperature":25.3,"humidity":60.1,"lamp":1}';

const sensorFields = { sensorId: "node-living-01", snTimestamp: 1731700000, snCtr: 1731700000123, dataRaw: DATA_RAW };

describe("signature v2 — chuỗi ký", () => {
  it("node: v2|sn|<id>|<ts>|<ctr>|<sha256(data_raw)>", () => {
    assert.equal(
      sensorMessageV2(sensorFields),
      `v2|sn|node-living-01|1731700000|1731700000123|${sha256Hex(DATA_RAW)}`
    );
  });

  it("gateway: v2|gw|<gw>|<ts>|<ip>|<sensor>|<ctr>|<sn_hmac> (ip rỗng vẫn giữ chỗ)", () => {
    const snHmac = signMessage(NODE_SECRET, sensorMessageV2(sensorFields));
    const base = { gatewayId: "gw-s3-01", gwTimestamp: 1731700001, sensorId: "node-living-01", snCtr: 1731700000123, snHmac };
    assert.equal(
      gatewayMessageV2({ ...base, gatewayIp: "192.168.1.50" }),
      `v2|gw|gw-s3-01|1731700001|192.168.1.50|node-living-01|1731700000123|${snHmac}`
    );
    assert.equal(gatewayMessageV2({ ...base, gatewayIp: "" }), `v2|gw|gw-s3-01|1731700001||node-living-01|1731700000123|${snHmac}`);
  });

  it("chữ ký là hex thường 64 ký tự và khớp lại được", () => {
    const sig = signMessage(NODE_SECRET, sensorMessageV2(sensorFields));
    assert.match(sig, /^[0-9a-f]{64}$/);
    assert.ok(verifyMessage(NODE_SECRET, sensorMessageV2(sensorFields), sig));
    assert.ok(verifyMessage(NODE_SECRET, sensorMessageV2(sensorFields), sig.toUpperCase()), "chấp nhận hex hoa");
  });
});

// Vector cố định (tính độc lập bằng node:crypto) — firmware sm_*_v2 và tests/security/lib_v2.sh phải ra đúng các giá trị này.
describe("signature v2 — heartbeat / ack / sự kiện camera (hợp đồng A+B §2)", () => {
  const HB_BODY =
    '{"uptime":120,"rssi":-55,"ip":"192.168.1.50","fw_version":"1.2.3","nodes":[{"device_id":"node-living-01","online":true}]}';
  const CMD = "0b9f7f6e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
  const ack = { gatewayId: "gw-s3-01", deviceUid: "node-living-01", commandId: CMD, status: "ok" as const, ts: 1731700000 };
  const evt = { gatewayId: "gw-s3-01", cameraId: "cam-door-01", type: "motion", ts: 1731700000 };

  it("heartbeat: v2|hb|<gw>|<ts>|<ctr>|<sha256(body_raw)>", () => {
    const message = heartbeatMessageV2({ gatewayId: "gw-s3-01", ts: 1731700000, ctr: 1731700000123, bodyRaw: HB_BODY });
    assert.equal(
      message,
      "v2|hb|gw-s3-01|1731700000|1731700000123|5cb1ebe5315027c6b8965052a321bc2cbb59d93be7baba0120556ae5b4de6dc1"
    );
    assert.equal(signMessage(GW_SECRET, message), "5aff042b08f47a9c5cce7cc30f78be93a06cfdf7206de39cf88864f9be4e1cf0");
  });

  it("heartbeat: sửa một ký tự của body_raw → sai chữ ký", () => {
    const base = { gatewayId: "gw-s3-01", ts: 1731700000, ctr: 1731700000123 };
    const sig = signMessage(GW_SECRET, heartbeatMessageV2({ ...base, bodyRaw: HB_BODY }));
    assert.equal(verifyMessage(GW_SECRET, heartbeatMessageV2({ ...base, bodyRaw: HB_BODY.replace("120", "121") }), sig), false);
    assert.equal(verifyMessage(GW_SECRET, heartbeatMessageV2({ ...base, ctr: base.ctr + 1, bodyRaw: HB_BODY }), sig), false);
  });

  it("ack: power true/false/vắng ký '1' / '0' / chuỗi rỗng", () => {
    const m1 = ackMessageV2({ ...ack, power: true });
    assert.equal(m1, `v2|ack|gw-s3-01|node-living-01|${CMD}|ok|1|1731700000`);
    assert.equal(signMessage(GW_SECRET, m1), "9dd9eff5ac24ea0c323a3ec101800c91e9d0d2bfd7dddebd1bcffe3897fe91e6");
    const m0 = ackMessageV2({ ...ack, power: false });
    assert.equal(m0, `v2|ack|gw-s3-01|node-living-01|${CMD}|ok|0|1731700000`);
    assert.equal(signMessage(GW_SECRET, m0), "7f78dfea7a496bb674fc5cab21ef4e3a7f82bb6ddb72be0c4ba4989615b6a2c3");
    const mNone = ackMessageV2({ ...ack, power: null });
    assert.equal(mNone, `v2|ack|gw-s3-01|node-living-01|${CMD}|ok||1731700000`);
    assert.equal(signMessage(GW_SECRET, mNone), "9d6d356cdc94e9f37c158fbd8f5ea64e7c14bae99aa0a56be1022f2a81672a2e");
  });

  it("ack: ack của thiết bị/lệnh khác hoặc đổi power → sai chữ ký", () => {
    const sig = signMessage(GW_SECRET, ackMessageV2({ ...ack, power: true }));
    assert.equal(verifyMessage(GW_SECRET, ackMessageV2({ ...ack, power: false }), sig), false);
    assert.equal(verifyMessage(GW_SECRET, ackMessageV2({ ...ack, power: true, deviceUid: "node-living-02" }), sig), false);
    assert.equal(verifyMessage(GW_SECRET, ackMessageV2({ ...ack, power: true, status: "error" }), sig), false);
  });

  it("sự kiện camera: snapshot_id vắng ký chuỗi rỗng", () => {
    const withSnap = cameraEventMessageV2({ ...evt, snapshotId: "345" });
    assert.equal(withSnap, "v2|evt|gw-s3-01|cam-door-01|motion|1731700000|345");
    assert.equal(signMessage(GW_SECRET, withSnap), "95bfae69d24f331756c6db5f308a599b01a26c613a277bf61706392ee9181c59");
    const noSnap = cameraEventMessageV2({ ...evt, snapshotId: null });
    assert.equal(noSnap, "v2|evt|gw-s3-01|cam-door-01|motion|1731700000|");
    assert.equal(signMessage(GW_SECRET, noSnap), "9a1846db5fd7afff9b8d1cb152bfef8f85d61a5b5f2cb98855c0d92c94018803");
  });

  it("tiền tố tách miền: chữ ký hb/ack/evt không dùng chéo được và không khớp chuỗi cũ", () => {
    const sigEvt = signMessage(GW_SECRET, cameraEventMessageV2({ ...evt, snapshotId: null }));
    assert.equal(verifyMessage(GW_SECRET, `cam-door-01:motion:${evt.ts}`, sigEvt), false);
    assert.equal(verifyMessage(GW_SECRET, ackMessageV2({ ...ack, power: null }), sigEvt), false);
  });
});

describe("signature v2 — chống giả mạo", () => {
  const sig = signMessage(NODE_SECRET, sensorMessageV2(sensorFields));

  it("sửa một ký tự trong data_raw → sai chữ ký", () => {
    const tampered = { ...sensorFields, dataRaw: DATA_RAW.replace("25.3", "45.3") };
    assert.equal(verifyMessage(NODE_SECRET, sensorMessageV2(tampered), sig), false);
  });

  it("đổi định dạng số (25.3 → 25.30) cũng sai — Gateway phải chuyển data_raw nguyên văn", () => {
    const reformatted = { ...sensorFields, dataRaw: DATA_RAW.replace("25.3", "25.30") };
    assert.equal(verifyMessage(NODE_SECRET, sensorMessageV2(reformatted), sig), false);
  });

  it("đổi ctr / ts / sensor_id → sai chữ ký", () => {
    assert.equal(verifyMessage(NODE_SECRET, sensorMessageV2({ ...sensorFields, snCtr: sensorFields.snCtr + 1 }), sig), false);
    assert.equal(verifyMessage(NODE_SECRET, sensorMessageV2({ ...sensorFields, snTimestamp: 1731700001 }), sig), false);
    assert.equal(verifyMessage(NODE_SECRET, sensorMessageV2({ ...sensorFields, sensorId: "node-living-02" }), sig), false);
  });

  it("secret khác (VD secret gateway) không tạo được chữ ký node", () => {
    assert.equal(verifyMessage(GW_SECRET, sensorMessageV2(sensorFields), sig), false);
  });

  it("chữ ký v1 '<id>:<ts>' không dùng được cho v2 (tách miền)", () => {
    const v1 = signMessage(NODE_SECRET, `${sensorFields.sensorId}:${sensorFields.snTimestamp}`);
    assert.equal(verifyMessage(NODE_SECRET, sensorMessageV2(sensorFields), v1), false);
  });

  it("chữ ký sai định dạng (không phải hex, sai độ dài) → false, không ném lỗi", () => {
    assert.equal(verifyMessage(NODE_SECRET, sensorMessageV2(sensorFields), "zz"), false);
    assert.equal(verifyMessage(NODE_SECRET, sensorMessageV2(sensorFields), sig.slice(0, 62)), false);
  });
});

describe("signature v2 — bộ đếm", () => {
  it("ctr không được vượt quá bây giờ + 1 ngày", () => {
    const now = 1_731_700_000_000;
    assert.ok(isCounterInRange(now, now));
    assert.ok(isCounterInRange(now + COUNTER_MAX_AHEAD_MS, now));
    assert.equal(isCounterInRange(now + COUNTER_MAX_AHEAD_MS + 1, now), false);
  });
});
