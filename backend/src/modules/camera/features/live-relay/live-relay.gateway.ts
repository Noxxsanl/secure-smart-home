// Gắn camera live vào HTTP server: 2 route upgrade đăng ký vào bộ định tuyến dùng chung (core/ws/upgrade-router.ts).
//   GET /api/device/camera/live             uplink gateway (HMAC)  — live-uplink.controller.ts
//   GET /api/portal/cameras/:deviceId/live  viewer web (cookie)    — live-viewer.controller.ts
// main.ts gọi attachCameraLive(server, app, upgrades) sau khi server đã listen. Server đóng → kết thúc mọi phiên.
import type { Application } from "express";
import type { Server } from "http";
import type { UpgradeRouter } from "../../../../core/ws/upgrade-router";
import { UPLINK_PATH, VIEWER_PATH } from "./live-relay.dto";
import { closeAllLiveSessions } from "./live-relay.handler";
import { createUplinkUpgradeHandler } from "./live-uplink.controller";
import { createViewerUpgradeHandler } from "./live-viewer.controller";

export function attachCameraLive(server: Server, app: Application, upgrades: UpgradeRouter): void {
  upgrades.on(UPLINK_PATH, createUplinkUpgradeHandler(app));
  upgrades.on(VIEWER_PATH, createViewerUpgradeHandler(app));
  server.on("close", closeAllLiveSessions);
}
