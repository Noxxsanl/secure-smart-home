// Module camera: ảnh chụp + xem trực tiếp camera (ESP32-CAM → gateway → server) — FR-5.8. Sở hữu camera_snapshots.
// File JPEG nằm ngoài DB, qua port SnapshotStore (infrastructure/storage).
//
// Bảng route:
//   POST /api/device/camera/snapshot          ingest-snapshot (HMAC gateway gắn với nội dung ảnh; express.raw image/jpeg ≤ 200 KB)
//   GET  /api/portal|mobile/devices/:deviceId/snapshots?limit=   list-camera-snapshots
//   GET  /api/portal|mobile/snapshots/:snapshotId/image          get-snapshot-image (stream JPEG)
// WebSocket (KHÔNG qua router Express; đăng ký vào core/ws/upgrade-router.ts bởi attachCameraLive ở main.ts):
//   GET /api/device/camera/live             live-relay: uplink gateway (HMAC gateway + session_id) đẩy khung JPEG lên
//   GET /api/portal/cameras/:deviceId/live  live-relay: viewer web (cookie sh_user + kiểm Origin), chỉ OWNER/CONTROLLER/VIEWER
// Phiên xem nằm trong RAM (domain/live-session.ts); live_start/live_stop gửi gateway bằng MQTT (control.publishSessionCommand).
// MQTT: home/+/gateway/+/device/+/camera/event (camera-event → thông báo CAMERA_MOTION). Job: purge-old-snapshots.
// Thứ tự middleware của route ingest: precheckSnapshotRequest (các kiểm rẻ, chưa cần body) → express.raw →
// verifySnapshotSignature (HMAC có sha256 của body nên phải đọc body trước). Kẻ không qua kiểm rẻ không bắt server
// buffer body. express.raw chỉ gắn trên đúng route này (app.ts giữ express.json 10 KB cho phần còn lại); body quá cỡ
// → body-parser ném entity.too.large, error filter đổi thành 413 PAYLOAD_TOO_LARGE.
import express, { Router } from "express";
import type { AppModule } from "../../shared/module";
import { MAX_SNAPSHOT_BYTES } from "./domain/camera.types";
import { startCameraEventConsumer } from "./features/camera-event/camera-event.consumer";
import { getSnapshotImageController } from "./features/get-snapshot-image/get-snapshot-image.controller";
import { precheckSnapshotRequest, verifySnapshotSignature } from "./features/ingest-snapshot/authenticate-gateway.middleware";
import { ingestSnapshotController } from "./features/ingest-snapshot/ingest-snapshot.controller";
import { listCameraSnapshotsController } from "./features/list-camera-snapshots/list-camera-snapshots.controller";
import { startSnapshotRetentionJob } from "./features/purge-old-snapshots/purge-old-snapshots.job";

export const cameraModule: AppModule = {
  name: "camera",
  device: (router) => {
    const camera = Router();
    camera.post(
      "/snapshot",
      precheckSnapshotRequest,
      express.raw({ type: "image/jpeg", limit: MAX_SNAPSHOT_BYTES }),
      verifySnapshotSignature,
      ingestSnapshotController
    );
    router.use("/camera", camera);
  },
  customer: (router) => {
    router.get("/devices/:deviceId/snapshots", listCameraSnapshotsController);
    router.get("/snapshots/:snapshotId/image", getSnapshotImageController);
  },
  workers: [
    { name: "cameraEventConsumer", start: startCameraEventConsumer },
    { name: "snapshotRetention", start: startSnapshotRetentionJob },
  ],
};
