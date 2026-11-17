// Test mã hoá secret thiết bị khi lưu (FR-12.8) — node:test, không cần DB.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { describe, it } from "node:test";
import { isSealedSecret, openSecret, sealSecret } from "./secret-box";

const KEY = crypto.randomBytes(32);
const OTHER_KEY = crypto.randomBytes(32);
const SECRET = "3f1c0a9b8e7d6c5b4a39281706f5e4d3c2b1a0f9e8d7c6b5a4938271605f4e3d";

describe("secret-box", () => {
  it("mã hoá rồi giải mã đúng thiết bị → bản rõ", () => {
    const sealed = sealSecret(KEY, "gw-s3-01", SECRET);
    assert.ok(isSealedSecret(sealed));
    assert.ok(!sealed.includes(SECRET), "bản mã không chứa bản rõ");
    assert.ok(sealed.length <= 255, "vừa cột VARCHAR(255)");
    assert.equal(openSecret(KEY, "gw-s3-01", sealed), SECRET);
  });

  it("mỗi lần mã hoá ra bản mã khác (IV ngẫu nhiên)", () => {
    assert.notEqual(sealSecret(KEY, "gw-s3-01", SECRET), sealSecret(KEY, "gw-s3-01", SECRET));
  });

  it("chép bản mã sang thiết bị khác (AAD) → không mở được", () => {
    const sealed = sealSecret(KEY, "gw-s3-01", SECRET);
    assert.equal(openSecret(KEY, "node-living-01", sealed), null);
  });

  it("sai khoá / thiếu khoá → null", () => {
    const sealed = sealSecret(KEY, "gw-s3-01", SECRET);
    assert.equal(openSecret(OTHER_KEY, "gw-s3-01", sealed), null);
    assert.equal(openSecret(null, "gw-s3-01", sealed), null);
  });

  it("bản mã bị sửa → null (GCM tag)", () => {
    const sealed = sealSecret(KEY, "gw-s3-01", SECRET);
    const [iv, body, tag] = sealed.slice("enc1:".length).split(".");
    const flipped = Buffer.from(body, "base64url");
    flipped[0] ^= 0x01;
    assert.equal(openSecret(KEY, "gw-s3-01", `enc1:${iv}.${flipped.toString("base64url")}.${tag}`), null);
    assert.equal(openSecret(KEY, "gw-s3-01", "enc1:garbage"), null);
  });

  it("dữ liệu cũ dạng rõ vẫn đọc được (chuyển đổi dần)", () => {
    assert.equal(isSealedSecret(SECRET), false);
    assert.equal(openSecret(KEY, "gw-s3-01", SECRET), SECRET);
    assert.equal(openSecret(null, "gw-s3-01", SECRET), SECRET);
  });
});
