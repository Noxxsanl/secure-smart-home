// Test giới hạn lỗi xác thực theo IP của uplink camera live (A1).
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  UPLINK_FAIL_MAX,
  UPLINK_FAIL_WINDOW_MS,
  isUplinkAuthBlocked,
  recordUplinkAuthFailure,
  resetUplinkFailLimiterForTest,
} from "./uplink-fail-limiter";

const T0 = 1_731_700_000_000;

describe("uplink-fail-limiter", () => {
  beforeEach(() => resetUplinkFailLimiterForTest());

  it("chưa đủ 20 lỗi thì chưa chặn; đủ 20 lỗi → chặn", () => {
    for (let i = 0; i < UPLINK_FAIL_MAX - 1; i++) recordUplinkAuthFailure("1.2.3.4", T0 + i);
    assert.equal(isUplinkAuthBlocked("1.2.3.4", T0 + 100), false);
    recordUplinkAuthFailure("1.2.3.4", T0 + 99);
    assert.equal(isUplinkAuthBlocked("1.2.3.4", T0 + 100), true);
  });

  it("IP khác không bị ảnh hưởng", () => {
    for (let i = 0; i < UPLINK_FAIL_MAX; i++) recordUplinkAuthFailure("1.2.3.4", T0 + i);
    assert.equal(isUplinkAuthBlocked("5.6.7.8", T0 + 100), false);
  });

  it("hết cửa sổ 15 phút thì mở lại", () => {
    for (let i = 0; i < UPLINK_FAIL_MAX; i++) recordUplinkAuthFailure("1.2.3.4", T0 + i);
    assert.equal(isUplinkAuthBlocked("1.2.3.4", T0 + UPLINK_FAIL_WINDOW_MS - 1), true);
    assert.equal(isUplinkAuthBlocked("1.2.3.4", T0 + UPLINK_FAIL_WINDOW_MS + UPLINK_FAIL_MAX), false);
  });

  it("bị dội sau khi đã chặn không làm danh sách phình (trần UPLINK_FAIL_MAX)", () => {
    for (let i = 0; i < 1000; i++) recordUplinkAuthFailure("1.2.3.4", T0 + i);
    assert.equal(isUplinkAuthBlocked("1.2.3.4", T0 + 2000), true);
  });
});

describe("uplink-fail-limiter — khoá ip|gateway_id", () => {
  beforeEach(() => resetUplinkFailLimiterForTest());

  it("rác vào một gateway_id không chặn gateway khác cùng IP (nginx)", () => {
    for (let i = 0; i < UPLINK_FAIL_MAX; i++) recordUplinkAuthFailure("172.18.0.5|GW-ATTACK", T0 + i);
    assert.equal(isUplinkAuthBlocked("172.18.0.5|GW-ATTACK", T0 + 100), true);
    assert.equal(isUplinkAuthBlocked("172.18.0.5|GW-REAL", T0 + 100), false);
    assert.equal(isUplinkAuthBlocked("172.18.0.5|-", T0 + 100), false);
  });
});
