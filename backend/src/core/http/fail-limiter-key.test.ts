// Test khoá chia xô + tiêu chí đếm của các bộ giới hạn lỗi xác thực đường thiết bị (M1).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deviceDataFailKey,
  gatewayScopedKey,
  isAuthRejectionStatus,
  requestWasNotCountedFailure,
  snapshotFailKey,
} from "./fail-limiter-key";

describe("fail-limiter-key — khoá <ip>|<gateway_id>", () => {
  it("snapshot: lấy gateway id từ header X-Gateway-Id", () => {
    assert.equal(snapshotFailKey({ ip: "172.18.0.5", headers: { "x-gateway-id": "ESP32-GW-A1" } }), "172.18.0.5|ESP32-GW-A1");
  });

  it("hai gateway cùng IP nginx → hai xô khác nhau", () => {
    const a = snapshotFailKey({ ip: "172.18.0.5", headers: { "x-gateway-id": "ESP32-GW-A1" } });
    const b = snapshotFailKey({ ip: "172.18.0.5", headers: { "x-gateway-id": "ESP32-GW-B2" } });
    assert.notEqual(a, b);
  });

  it("header thiếu / sai dạng / lặp nhiều giá trị → xô <ip>|-", () => {
    assert.equal(snapshotFailKey({ ip: "1.2.3.4", headers: {} }), "1.2.3.4|-");
    assert.equal(snapshotFailKey({ ip: "1.2.3.4", headers: { "x-gateway-id": "gw\r\nx" } }), "1.2.3.4|-");
    assert.equal(snapshotFailKey({ ip: "1.2.3.4", headers: { "x-gateway-id": "a".repeat(65) } }), "1.2.3.4|-");
    assert.equal(snapshotFailKey({ ip: "1.2.3.4", headers: { "x-gateway-id": ["gw-1", "gw-2"] } }), "1.2.3.4|-");
  });

  it("telemetry HTTP: lấy gateway_id trong body; body không phải object / gateway_id sai → <ip>|-", () => {
    assert.equal(deviceDataFailKey({ ip: "1.2.3.4", body: { gateway_id: "gw-s3-01", x: 1 } }), "1.2.3.4|gw-s3-01");
    assert.equal(deviceDataFailKey({ ip: "1.2.3.4", body: { gateway_id: 123 } }), "1.2.3.4|-");
    assert.equal(deviceDataFailKey({ ip: "1.2.3.4", body: { gateway_id: "a|b" } }), "1.2.3.4|-");
    assert.equal(deviceDataFailKey({ ip: "1.2.3.4", body: "text" }), "1.2.3.4|-");
    assert.equal(deviceDataFailKey({ ip: "1.2.3.4" }), "1.2.3.4|-");
    assert.equal(deviceDataFailKey({ ip: "1.2.3.4", body: null }), "1.2.3.4|-");
  });

  it("không có ip → 'unknown'", () => {
    assert.equal(gatewayScopedKey(undefined, "gw-1"), "unknown|gw-1");
  });
});

describe("fail-limiter-key — chỉ đếm lỗi xác thực", () => {
  it("400/401/403/404 là lỗi xác thực", () => {
    for (const s of [400, 401, 403, 404]) assert.equal(isAuthRejectionStatus(s), true, String(s));
  });

  it("409/413/415/500/503 không đếm", () => {
    for (const s of [409, 413, 415, 500, 503]) assert.equal(isAuthRejectionStatus(s), false, String(s));
  });

  it("requestWasNotCountedFailure: lượt hợp lệ + 409/413/415/5xx được trả lại; 4xx xác thực và 429 giữ lại", () => {
    for (const s of [200, 201, 204, 409, 413, 415, 500, 502]) assert.equal(requestWasNotCountedFailure(s), true, String(s));
    for (const s of [400, 401, 403, 404, 429]) assert.equal(requestWasNotCountedFailure(s), false, String(s));
  });
});
