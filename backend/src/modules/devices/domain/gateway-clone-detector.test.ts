// Test phát hiện Gateway nghi bị nhân bản (A2) — hàm thuần, không DB/MQTT.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CLONE_ALERT_COOLDOWN_MS,
  CLONE_WINDOW_MS,
  COUNTER_REPLAYS_TO_ALERT,
  IP_CHANGES_TO_ALERT,
  UPTIME_REGRESSIONS_TO_ALERT,
  createCloneState,
  observeCounterReplay,
  observeHeartbeat,
} from "./gateway-clone-detector";

const T0 = 1_731_700_000_000;
const SEC = 1000;

describe("gateway-clone-detector — uptime lùi", () => {
  it("heartbeat bình thường (uptime tăng, ip ổn định) không báo", () => {
    const s = createCloneState();
    for (let i = 0; i < 20; i++) {
      assert.equal(observeHeartbeat(s, { at: T0 + i * 30 * SEC, uptime: 100 + i * 30, ip: "192.168.1.50" }), null);
    }
  });

  it("một lần khởi động lại (uptime lùi 1 lần) chưa đủ ngưỡng", () => {
    const s = createCloneState();
    assert.equal(observeHeartbeat(s, { at: T0, uptime: 5000, ip: "192.168.1.50" }), null);
    assert.equal(observeHeartbeat(s, { at: T0 + 30 * SEC, uptime: 10, ip: "192.168.1.50" }), null);
    assert.equal(observeHeartbeat(s, { at: T0 + 60 * SEC, uptime: 40, ip: "192.168.1.50" }), null);
  });

  it("lùi ≤ 5 s (lệch thứ tự / làm tròn) không tính", () => {
    const s = createCloneState();
    observeHeartbeat(s, { at: T0, uptime: 1000, ip: null });
    assert.equal(observeHeartbeat(s, { at: T0 + SEC, uptime: 995, ip: null }), null);
    assert.equal(observeHeartbeat(s, { at: T0 + 2 * SEC, uptime: 990, ip: null }), null);
    assert.equal(s.uptimeRegressions.length, 0);
  });

  it("hai board xen kẽ (uptime lùi ≥ 2 lần trong 10 phút) → UPTIME_REGRESSION", () => {
    const s = createCloneState();
    assert.equal(observeHeartbeat(s, { at: T0, uptime: 5000, ip: null }), null);
    assert.equal(observeHeartbeat(s, { at: T0 + 10 * SEC, uptime: 20, ip: null }), null); // lùi lần 1
    assert.equal(observeHeartbeat(s, { at: T0 + 20 * SEC, uptime: 5030, ip: null }), null); // board A tăng lại: uptime tăng
    assert.equal(observeHeartbeat(s, { at: T0 + 30 * SEC, uptime: 50, ip: null }), "UPTIME_REGRESSION"); // lùi lần 2
  });

  it("hai lần lùi cách nhau quá 10 phút không cộng dồn", () => {
    const s = createCloneState();
    observeHeartbeat(s, { at: T0, uptime: 5000, ip: null });
    observeHeartbeat(s, { at: T0 + SEC, uptime: 10, ip: null }); // lùi 1
    observeHeartbeat(s, { at: T0 + 9 * 60 * SEC, uptime: 600, ip: null });
    assert.equal(observeHeartbeat(s, { at: T0 + CLONE_WINDOW_MS + 5 * SEC, uptime: 20, ip: null }), null); // lùi 2, nhưng lần 1 đã hết hạn
  });

  it("uptime vắng (null) giữ giá trị trước, không tính là lùi", () => {
    const s = createCloneState();
    observeHeartbeat(s, { at: T0, uptime: 5000, ip: null });
    assert.equal(observeHeartbeat(s, { at: T0 + SEC, uptime: null, ip: null }), null);
    assert.equal(s.lastUptime, 5000);
  });
});

describe("gateway-clone-detector — ip đổi qua lại", () => {
  it("đổi ip 1–2 lần (DHCP cấp lại) không báo", () => {
    const s = createCloneState();
    assert.equal(observeHeartbeat(s, { at: T0, uptime: 100, ip: "192.168.1.50" }), null);
    assert.equal(observeHeartbeat(s, { at: T0 + 30 * SEC, uptime: 130, ip: "192.168.1.51" }), null);
    assert.equal(observeHeartbeat(s, { at: T0 + 60 * SEC, uptime: 160, ip: "192.168.1.50" }), null);
  });

  it("ip luân phiên giữa 2 giá trị ≥ 3 lần trong 10 phút → IP_FLAPPING", () => {
    const s = createCloneState();
    assert.equal(observeHeartbeat(s, { at: T0, uptime: 100, ip: "192.168.1.50" }), null);
    assert.equal(observeHeartbeat(s, { at: T0 + 10 * SEC, uptime: 110, ip: "192.168.1.77" }), null); // đổi 1
    assert.equal(observeHeartbeat(s, { at: T0 + 20 * SEC, uptime: 120, ip: "192.168.1.50" }), null); // đổi 2
    assert.equal(observeHeartbeat(s, { at: T0 + 30 * SEC, uptime: 130, ip: "192.168.1.77" }), "IP_FLAPPING"); // đổi 3
  });

  it("ip đổi rải rác quá 10 phút không cộng dồn", () => {
    const s = createCloneState();
    observeHeartbeat(s, { at: T0, uptime: 1, ip: "10.0.0.1" });
    observeHeartbeat(s, { at: T0 + 1 * 60 * SEC, uptime: 61, ip: "10.0.0.2" });
    observeHeartbeat(s, { at: T0 + 6 * 60 * SEC, uptime: 361, ip: "10.0.0.1" });
    assert.equal(observeHeartbeat(s, { at: T0 + 12 * 60 * SEC, uptime: 721, ip: "10.0.0.2" }), null);
  });

  it("ip vắng (null) không tính là đổi", () => {
    const s = createCloneState();
    observeHeartbeat(s, { at: T0, uptime: 1, ip: "10.0.0.1" });
    assert.equal(observeHeartbeat(s, { at: T0 + SEC, uptime: 2, ip: null }), null);
    assert.equal(s.ipChanges.length, 0);
    assert.equal(s.lastIp, "10.0.0.1");
  });
});

describe("gateway-clone-detector — ctr phát lại đúng chữ ký", () => {
  it("2 lần chưa báo, lần thứ 3 trong 10 phút → COUNTER_REPLAY", () => {
    const s = createCloneState();
    assert.equal(observeCounterReplay(s, T0), null);
    assert.equal(observeCounterReplay(s, T0 + 60 * SEC), null);
    assert.equal(observeCounterReplay(s, T0 + 120 * SEC), "COUNTER_REPLAY");
  });

  it("3 lần nhưng trải quá 10 phút không báo", () => {
    const s = createCloneState();
    observeCounterReplay(s, T0);
    observeCounterReplay(s, T0 + 5 * 60 * SEC);
    assert.equal(observeCounterReplay(s, T0 + CLONE_WINDOW_MS + SEC), null);
  });
});

describe("gateway-clone-detector — cooldown 1 giờ", () => {
  function triggerUptime(s: ReturnType<typeof createCloneState>, at: number): string | null {
    // 2 lần lùi liên tiếp kể từ thời điểm `at`
    observeHeartbeat(s, { at, uptime: 5000, ip: null });
    observeHeartbeat(s, { at: at + SEC, uptime: 10, ip: null });
    observeHeartbeat(s, { at: at + 2 * SEC, uptime: 6000, ip: null });
    return observeHeartbeat(s, { at: at + 3 * SEC, uptime: 20, ip: null });
  }

  it("báo 1 lần rồi im trong 1 giờ dù dấu hiệu còn", () => {
    const s = createCloneState();
    assert.equal(triggerUptime(s, T0), "UPTIME_REGRESSION");
    assert.equal(triggerUptime(s, T0 + 5 * 60 * SEC), null);
    assert.equal(observeCounterReplay(s, T0 + 6 * 60 * SEC), null);
  });

  it("sau 1 giờ báo lại được", () => {
    const s = createCloneState();
    assert.equal(triggerUptime(s, T0), "UPTIME_REGRESSION");
    assert.equal(triggerUptime(s, T0 + CLONE_ALERT_COOLDOWN_MS + 10 * SEC), "UPTIME_REGRESSION");
  });

  it("trạng thái mỗi gateway độc lập", () => {
    const a = createCloneState();
    const b = createCloneState();
    assert.equal(triggerUptime(a, T0), "UPTIME_REGRESSION");
    assert.equal(triggerUptime(b, T0), "UPTIME_REGRESSION");
  });
});

describe("gateway-clone-detector — trần bộ nhớ", () => {
  it("counterReplays không vượt ngưỡng báo dù bị dội nhiều lần trong cửa sổ", () => {
    const s = createCloneState();
    // Dội 3 lần để báo (vào cooldown), rồi dội thêm 100 lần
    observeCounterReplay(s, T0);
    observeCounterReplay(s, T0 + SEC);
    assert.equal(observeCounterReplay(s, T0 + 2 * SEC), "COUNTER_REPLAY");
    for (let i = 0; i < 100; i++) observeCounterReplay(s, T0 + 3 * SEC + i);
    assert.equal(s.counterReplays.length, 0, "trong cooldown không tích luỹ");
  });

  it("ngoài cooldown, mảng mốc bị cắt ở ngưỡng (giữ phần tử mới nhất)", () => {
    const s = createCloneState();
    s.lastAlertAt = null;
    // Dùng 2 lần (dưới ngưỡng 3) rồi thêm lần thứ 3 báo; để thử trần ta ép lastAlertAt cũ hơn cooldown sau đó
    observeCounterReplay(s, T0);
    observeCounterReplay(s, T0 + SEC);
    observeCounterReplay(s, T0 + 2 * SEC); // báo
    const after = T0 + CLONE_ALERT_COOLDOWN_MS + 10 * SEC;
    for (let i = 0; i < 50; i++) {
      observeCounterReplay(s, after + i * SEC);
      assert.ok(s.counterReplays.length <= COUNTER_REPLAYS_TO_ALERT);
    }
  });

  it("uptimeRegressions / ipChanges không vượt ngưỡng báo", () => {
    const s = createCloneState();
    s.lastAlertAt = T0; // đang cooldown → dọn
    for (let i = 0; i < 40; i++) {
      observeHeartbeat(s, { at: T0 + i * SEC, uptime: i % 2 === 0 ? 5000 : 10, ip: i % 2 === 0 ? "10.0.0.1" : "10.0.0.2" });
    }
    assert.equal(s.uptimeRegressions.length, 0);
    assert.equal(s.ipChanges.length, 0);
    s.lastAlertAt = null; // ngoài cooldown: tích luỹ nhưng có trần
    const s2 = createCloneState();
    for (let i = 0; i < 40; i++) {
      observeHeartbeat(s2, { at: T0 + i * SEC, uptime: i % 2 === 0 ? 5000 : 10, ip: i % 2 === 0 ? "10.0.0.1" : "10.0.0.2" });
      assert.ok(s2.uptimeRegressions.length <= UPTIME_REGRESSIONS_TO_ALERT);
      assert.ok(s2.ipChanges.length <= IP_CHANGES_TO_ALERT);
    }
  });

  it("trong cooldown tín hiệu không tích luỹ: hết cooldown phải đủ ngưỡng MỚI mới báo", () => {
    const s = createCloneState();
    observeHeartbeat(s, { at: T0, uptime: 5000, ip: null });
    observeHeartbeat(s, { at: T0 + SEC, uptime: 10, ip: null });
    observeHeartbeat(s, { at: T0 + 2 * SEC, uptime: 6000, ip: null });
    assert.equal(observeHeartbeat(s, { at: T0 + 3 * SEC, uptime: 20, ip: null }), "UPTIME_REGRESSION");
    // Một lần lùi nữa ngay trước khi hết cooldown: không được cộng với lần cũ
    observeHeartbeat(s, { at: T0 + 30 * 60 * SEC, uptime: 6000, ip: null });
    observeHeartbeat(s, { at: T0 + 30 * 60 * SEC + SEC, uptime: 20, ip: null });
    assert.equal(s.uptimeRegressions.length, 0);
  });
});
