// Xử lý một sự kiện camera (hiện chỉ "motion") do gateway publish:
//   1. topic + payload hợp lệ; gateway tồn tại, device_type = 'gateway', active, home_id trên topic = gateway.home_id;
//   2. ts trong cửa sổ ±300 s và chữ ký khớp — v2 (`"v":2`): HMAC-SHA256(secret gateway,
//      "v2|evt|<gw>|<camera_id>|<type>|<ts>|<snapshot_id hoặc rỗng>"); dạng cũ "<camera_id>:motion:<ts>" CHỈ khi
//      DEVICE_HMAC_V1=true. Verify qua getGatewaySigner (secret không rời module devices, invariant 1, 2);
//   3. camera tồn tại, category 'camera', thuộc gateway này và cùng nhà, status 'active';
//   4. chống lặp 60 s / camera (RAM; khởi động lại coi như chưa báo) → thông báo CAMERA_MOTION cho thành viên nhà.
// Message sai bị bỏ + log cảnh báo (không có chữ ký/secret). Không tăng fail_count: chữ ký sự kiện không có bộ đếm,
// và broker (mTLS + ACL) đã chỉ cho chính gateway publish topic này.
import { env } from "../../../../config/env";
import { notifyHomeMembers } from "../../../notifications";
import { cameraEventMessageV2, getDeviceRowByUid, getGatewaySigner, isTimestampValid } from "../../../devices";
import { parseCameraEventPayload, parseCameraEventTopic } from "../../domain/camera-event";

const MOTION_DEBOUNCE_MS = 60_000;
const lastMotionNotified = new Map<number, number>();

export async function handleCameraEvent(topic: string, raw: string): Promise<void> {
  const parsedTopic = parseCameraEventTopic(topic);
  if (!parsedTopic) {
    console.warn("[cameraEvent] bad topic – dropped");
    return;
  }
  const { homeId, gatewayUid, cameraUid } = parsedTopic;
  const payload = parseCameraEventPayload(raw);
  if (!payload) {
    console.warn(`[cameraEvent] invalid payload from ${gatewayUid} – dropped`);
    return;
  }

  if (payload.version === 1 && !env.deviceHmacV1) {
    console.warn(`[cameraEvent] ${gatewayUid} legacy v1 signature disabled – dropped`);
    return;
  }

  const gateway = await getDeviceRowByUid(gatewayUid);
  if (!gateway || gateway.device_type !== "gateway" || gateway.status !== "active") {
    console.warn(`[cameraEvent] ${gatewayUid} unknown, not a gateway or not active – dropped`);
    return;
  }
  if (gateway.home_id === null || gateway.home_id !== homeId) {
    console.warn(`[cameraEvent] ${gatewayUid} home mismatch – dropped`);
    return;
  }
  if (!isTimestampValid(payload.ts)) {
    console.warn(`[cameraEvent] ${gatewayUid} timestamp out of window – dropped`);
    return;
  }
  const signer = await getGatewaySigner(gateway.id);
  const message =
    payload.version === 2
      ? cameraEventMessageV2({
          gatewayId: gatewayUid,
          cameraId: cameraUid,
          type: payload.type,
          ts: payload.ts,
          snapshotId: payload.snapshotId,
        })
      : `${cameraUid}:motion:${payload.ts}`;
  if (!signer || !signer.verify(message, payload.hmac)) {
    console.warn(`[cameraEvent] ${gatewayUid} bad signature – dropped`);
    return;
  }

  const camera = await getDeviceRowByUid(cameraUid);
  if (
    !camera ||
    camera.category !== "camera" ||
    camera.gateway_device_id !== gateway.id ||
    camera.home_id !== homeId ||
    camera.status !== "active"
  ) {
    console.warn(`[cameraEvent] camera ${cameraUid} not found for ${gatewayUid} or not active – dropped`);
    return;
  }

  const now = Date.now();
  const previous = lastMotionNotified.get(camera.id);
  if (previous !== undefined && now - previous < MOTION_DEBOUNCE_MS) return;
  lastMotionNotified.set(camera.id, now);

  const place = camera.room_name ? ` (${camera.room_name})` : "";
  // Không gửi cho GUEST: GUEST chỉ thấy thiết bị được cấp nên không đoán được camera nào họ được phép xem
  await notifyHomeMembers({
    homeId,
    roles: ["OWNER", "CONTROLLER", "VIEWER"],
    type: "CAMERA_MOTION",
    title: "Phát hiện chuyển động",
    message: `${camera.device_name}${place} phát hiện chuyển động.`,
    severity: "warning",
    relatedDeviceId: camera.id,
  });
}
