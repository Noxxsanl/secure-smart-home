// Xử lý một message heartbeat của gateway (docs/API_DESIGN.md, hợp đồng A+B §2a):
//   1. topic + payload hợp lệ; gateway tồn tại, device_type = 'gateway', status = 'active';
//   2. home_id trên topic là số và BẰNG gateway.home_id (gateway không giả nhà khác);
//   3. ts trong cửa sổ ±300 s và chữ ký khớp — verify qua getGatewaySigner (secret không rời module devices, invariant 1, 2):
//        v2 (`"v":2`): HMAC(secret gateway, "v2|hb|<gw>|<ts>|<ctr>|<sha256_hex(body_raw)>") — chuỗi ký ở devices/domain/signature-v2.ts;
//        dạng cũ "<gateway_id>:<ts>" CHỈ nhận khi DEVICE_HMAC_V1=true (giống telemetry);
//   4. v2: ctr trong khoảng (isCounterInRange) rồi chiếm nguyên tử trên devices.last_ctr của DÒNG GATEWAY
//      (claimDeviceCounter) — gửi lại nguyên heartbeat cũ bị chặn; chỉ SAU đó mới parse body_raw;
//   5. hợp lệ → last_seen gateway (+ IP), last_seen mọi node `online: true` thuộc gateway này; thiết bị vừa
//      offline → online thì phát bus `device_state` để UI cập nhật ngay (presence monitor vẫn lo audit/thông báo);
//   6. theo dõi dấu hiệu Gateway bị nhân bản (domain/gateway-clone-detector.ts) — chỉ từ heartbeat đã đúng chữ ký.
// Message sai chỉ bị bỏ + log cảnh báo (không có secret/chữ ký) — không tăng fail_count: broker (mTLS + ACL) đã chỉ cho
// chính gateway publish topic này, và tăng fail_count theo topic sẽ cho kẻ có chứng chỉ khác nhưng ghi nhầm topic khoá oan.
import { env } from "../../../../config/env";
import { eventBus } from "../../../../shared/events/event-bus";
import { isOnline } from "../../../../shared/time";
import { logEvent } from "../../../audit";
import { notifyStaff } from "../../../notifications";
import {
  cloneStateFor,
  observeCounterReplay,
  observeHeartbeat,
  type CloneSignal,
} from "../../domain/gateway-clone-detector";
import { getGatewaySigner } from "../../domain/gateway-signer";
import {
  parseHeartbeatBodyRaw,
  parseHeartbeatEnvelope,
  parseHeartbeatTopic,
  type HeartbeatBody,
} from "../../domain/heartbeat";
import { isCounterInRange, isTimestampValid } from "../../domain/hmac.service";
import { heartbeatMessageV2 } from "../../domain/signature-v2";
import type { DeviceRow } from "../../domain/device.types";
import { claimDeviceCounter, markDeviceSeen, markProvisioned } from "../../infrastructure/device.repository";
import { getDeviceRowByUid, listGatewayChildrenByUids, toDeviceStateSnapshot } from "../../infrastructure/device.read-model";

function emitCameOnline(row: DeviceRow, seenAt: Date): void {
  if (row.home_id === null) return;
  // last_seen trong DB chưa cập nhật lúc kiểm → dùng thời điểm nhận làm last_seen mới (giống telemetry-ingested)
  eventBus.emit("device_state", { home_id: row.home_id, device: toDeviceStateSnapshot({ ...row, last_seen: seenAt }) });
}

async function touch(row: DeviceRow, ip: string | null, now: Date): Promise<void> {
  const wasOnline = isOnline(row.last_seen, now.getTime());
  await markDeviceSeen(row.id, ip);
  if (row.provision_status === "pending") await markProvisioned([row.id]);
  if (!wasOnline) emitCameOnline(row, now);
}

const SIGNAL_TEXT: Record<CloneSignal, string> = {
  UPTIME_REGRESSION: "thời gian chạy (uptime) liên tục bị lùi",
  IP_FLAPPING: "địa chỉ IP đổi qua lại giữa nhiều giá trị",
  COUNTER_REPLAY: "nhiều heartbeat đúng chữ ký bị từ chối vì bộ đếm trùng/lùi",
};

/**
 * Nghi nhân bản → audit GATEWAY_DUPLICATE_SUSPECTED + thông báo nhân viên (cơ chế sẵn có: notifyStaff, giống
 * "Gateway mất kết nối"). Không khoá/tự vô hiệu gateway: không biết board nào là thật, khoá nhầm sẽ làm hỏng nhà khách.
 * Không đưa secret/chữ ký/payload vào details (invariant 2).
 */
async function reportDuplicateSuspected(gateway: DeviceRow, signal: CloneSignal): Promise<void> {
  console.warn(`[heartbeat] ${gateway.device_id} suspected duplicate (${signal})`);
  await logEvent({
    eventType: "GATEWAY_DUPLICATE_SUSPECTED",
    deviceId: gateway.id,
    homeId: gateway.home_id,
    message: `Gateway ${gateway.device_id} nghi bị nhân bản: ${SIGNAL_TEXT[signal]}.`,
    details: { gateway_id: gateway.device_id, signal },
  });
  await notifyStaff({
    targetRole: "all",
    type: "GATEWAY_DUPLICATE_SUSPECTED",
    title: "Gateway nghi bị nhân bản",
    message: `Gateway ${gateway.device_id} NGHI có hai thiết bị cùng dùng một danh tính (${SIGNAL_TEXT[signal]}). Cũng có thể chỉ là gateway khởi động lại liên tiếp hoặc vừa xoá NVS mà chưa đăng ký lại (npm run hw:register). Hãy kiểm tra và cấp lại chứng chỉ/secret nếu đúng là nhân bản.`,
    severity: "warning",
    homeId: gateway.home_id,
    relatedDeviceId: gateway.id,
  });
}

export async function handleHeartbeat(topic: string, raw: string): Promise<void> {
  const parsedTopic = parseHeartbeatTopic(topic);
  if (!parsedTopic) {
    console.warn("[heartbeat] bad topic – dropped");
    return;
  }
  const envelope = parseHeartbeatEnvelope(raw);
  if (!envelope) {
    console.warn(`[heartbeat] invalid payload from ${parsedTopic.gatewayUid} – dropped`);
    return;
  }
  if (envelope.version === 1 && !env.deviceHmacV1) {
    console.warn(`[heartbeat] ${parsedTopic.gatewayUid} legacy v1 signature disabled – dropped`);
    return;
  }

  const gateway = await getDeviceRowByUid(parsedTopic.gatewayUid);
  if (!gateway || gateway.device_type !== "gateway" || gateway.status !== "active") {
    console.warn(`[heartbeat] ${parsedTopic.gatewayUid} unknown, not a gateway or not active – dropped`);
    return;
  }
  if (gateway.home_id === null || gateway.home_id !== parsedTopic.homeId) {
    console.warn(`[heartbeat] ${parsedTopic.gatewayUid} home mismatch – dropped`);
    return;
  }
  if (!isTimestampValid(envelope.ts)) {
    console.warn(`[heartbeat] ${parsedTopic.gatewayUid} timestamp out of window – dropped`);
    return;
  }
  const signer = await getGatewaySigner(gateway.id);
  const message =
    envelope.version === 2
      ? heartbeatMessageV2({ gatewayId: parsedTopic.gatewayUid, ts: envelope.ts, ctr: envelope.ctr, bodyRaw: envelope.bodyRaw })
      : `${parsedTopic.gatewayUid}:${envelope.ts}`;
  if (!signer || !signer.verify(message, envelope.hmac)) {
    console.warn(`[heartbeat] ${parsedTopic.gatewayUid} bad signature – dropped`);
    return;
  }

  const clone = cloneStateFor(gateway.id);
  let body: HeartbeatBody;
  if (envelope.version === 2) {
    if (!isCounterInRange(envelope.ctr)) {
      console.warn(`[heartbeat] ${parsedTopic.gatewayUid} counter out of range – dropped`);
      return;
    }
    if (!(await claimDeviceCounter(gateway.id, envelope.ctr))) {
      // Chữ ký đúng mà ctr ≤ last_ctr: gói bị phát lại, hoặc có HAI bộ đếm cùng danh tính (nghi nhân bản)
      console.warn(`[heartbeat] ${parsedTopic.gatewayUid} counter replayed – dropped`);
      const signal = observeCounterReplay(clone, Date.now());
      if (signal) await reportDuplicateSuspected(gateway, signal);
      return;
    }
    const parsedBody = parseHeartbeatBodyRaw(envelope.bodyRaw);
    if (!parsedBody) {
      console.warn(`[heartbeat] ${parsedTopic.gatewayUid} invalid body – dropped`);
      return;
    }
    body = parsedBody;
  } else {
    body = envelope;
  }

  const now = new Date();
  await touch(gateway, body.ip, now);

  const signal = observeHeartbeat(clone, { at: now.getTime(), uptime: body.uptime, ip: body.ip });
  if (signal) await reportDuplicateSuspected(gateway, signal);

  if (body.onlineNodeUids.length > 0) {
    const nodes = await listGatewayChildrenByUids(gateway.id, [...new Set(body.onlineNodeUids)]);
    for (const node of nodes) {
      // Node bị khoá/vô hiệu hoá không được "sống lại" bằng heartbeat (cũng tránh reset fail_count của thiết bị bị blocked)
      if (node.status !== "active") continue;
      await touch(node, null, now);
    }
  }
}
