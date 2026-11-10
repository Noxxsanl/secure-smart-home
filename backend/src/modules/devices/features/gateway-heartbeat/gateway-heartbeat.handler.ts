// Xử lý một message heartbeat của gateway (docs/API_DESIGN.md):
//   1. topic + payload hợp lệ; gateway tồn tại, device_type = 'gateway', status = 'active';
//   2. home_id trên topic là số và BẰNG gateway.home_id (gateway không giả nhà khác);
//   3. ts trong cửa sổ ±300 s và chữ ký HMAC-SHA256(secret gateway, "<gateway_id>:<ts>") khớp — verify qua
//      getGatewaySigner (secret không rời module devices, invariant 1, 2; cùng chuỗi ký với gw_hmac của telemetry);
//   4. hợp lệ → last_seen gateway (+ IP), last_seen mọi node `online: true` thuộc gateway này; thiết bị vừa
//      offline → online thì phát bus `device_state` để UI cập nhật ngay (presence monitor vẫn lo audit/thông báo).
// Message sai chỉ bị bỏ + log cảnh báo (không có secret/chữ ký) — không tăng fail_count, vì broker chưa có ACL nên
// ai cũng publish được và không nên dùng heartbeat giả để khoá gateway thật.
import { eventBus } from "../../../../shared/events/event-bus";
import { isOnline } from "../../../../shared/time";
import { getGatewaySigner } from "../../domain/gateway-signer";
import { parseHeartbeatPayload, parseHeartbeatTopic } from "../../domain/heartbeat";
import { isTimestampValid } from "../../domain/hmac.service";
import type { DeviceRow } from "../../domain/device.types";
import { markDeviceSeen, markProvisioned } from "../../infrastructure/device.repository";
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

export async function handleHeartbeat(topic: string, raw: string): Promise<void> {
  const parsedTopic = parseHeartbeatTopic(topic);
  if (!parsedTopic) {
    console.warn("[heartbeat] bad topic – dropped");
    return;
  }
  const payload = parseHeartbeatPayload(raw);
  if (!payload) {
    console.warn(`[heartbeat] invalid payload from ${parsedTopic.gatewayUid} – dropped`);
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
  if (!isTimestampValid(payload.ts)) {
    console.warn(`[heartbeat] ${parsedTopic.gatewayUid} timestamp out of window – dropped`);
    return;
  }
  const signer = await getGatewaySigner(gateway.id);
  if (!signer || !signer.verify(`${parsedTopic.gatewayUid}:${payload.ts}`, payload.hmac)) {
    console.warn(`[heartbeat] ${parsedTopic.gatewayUid} bad signature – dropped`);
    return;
  }

  const now = new Date();
  await touch(gateway, payload.ip, now);

  if (payload.onlineNodeUids.length > 0) {
    const nodes = await listGatewayChildrenByUids(gateway.id, [...new Set(payload.onlineNodeUids)]);
    for (const node of nodes) {
      // Node bị khoá/vô hiệu hoá không được "sống lại" bằng heartbeat (cũng tránh reset fail_count của thiết bị bị blocked)
      if (node.status !== "active") continue;
      await touch(node, null, now);
    }
  }
}
