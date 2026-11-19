// Module devices: sổ thiết bị (gateway + node), read model, quyền theo thiết bị, giám sát online/offline,
// xác thực HMAC thiết bị (chủ của secret_key). Sở hữu devices, device_tokens.
//
// Bảng route của module (thứ tự = thứ tự route cũ). Route cùng tiền tố do module khác khai báo:
//   /api/dashboard/devices/:id/telemetry          → telemetry (get-device-telemetry)
//   /api/dashboard/gateways/:id/{restart,factory-reset} → control (send-gateway-command)
// Router con /devices và /gateways bên dưới chỉ khai báo route theo method + path cụ thể, không có middleware
// không-path, nên request không khớp được chuyển tiếp (next) sang route của module kia.
import { Router } from "express";
import type { AppModule } from "../../shared/module";
import { getConsoleDeviceDetailController } from "./features/get-console-device-detail/get-console-device-detail.controller";
import { startGatewayHeartbeat } from "./features/gateway-heartbeat/gateway-heartbeat.consumer";
import { getDeviceDetailController } from "./features/get-device-detail/get-device-detail.controller";
import { getGatewayDetailController } from "./features/get-gateway-detail/get-gateway-detail.controller";
import { listConsoleDevicesController } from "./features/list-console-devices/list-console-devices.controller";
import { listGatewaysController } from "./features/list-gateways/list-gateways.controller";
import { startDeviceMonitor } from "./features/presence-monitor/presence-monitor.job";
import { removeDeviceController } from "./features/remove-device/remove-device.controller";
import { renameDeviceController } from "./features/rename-device/rename-device.controller";
import { startSecretSealer } from "./features/seal-secrets/seal-secrets.job";
import { setDeviceStatusController } from "./features/set-device-status/set-device-status.controller";
import { updateDeviceController } from "./features/update-device/update-device.controller";

// Đã gỡ GET /api/device/sensors (trả secret node cho chữ ký gateway — lỗ hổng đã biết, API_DESIGN §14 Q1): Gateway không
// còn giữ secret của Node (chữ ký Node chỉ backend kiểm). Đã gỡ worker đọc log $SYS để dò IP: broker không còn publish
// log ra topic; IP gateway lấy từ gateway_ip (telemetry) và ip (heartbeat).
export const devicesModule: AppModule = {
  name: "devices",
  dashboard: (router) => {
    const gateways = Router();
    gateways.get("/", listGatewaysController);
    gateways.get("/:id", getGatewayDetailController);
    router.use("/gateways", gateways);

    const devices = Router();
    devices.get("/", listConsoleDevicesController);
    devices.get("/:id", getConsoleDeviceDetailController);
    devices.patch("/:id/status", setDeviceStatusController);
    devices.patch("/:id", updateDeviceController);
    devices.delete("/:id", removeDeviceController);
    router.use("/devices", devices);
  },
  customer: (router) => {
    router.get("/devices/:deviceId", getDeviceDetailController);
    router.patch("/devices/:deviceId", renameDeviceController);
  },
  workers: [
    { name: "deviceMonitor", start: startDeviceMonitor }, // online/offline thiết bị, tick 15 s (features/presence-monitor)
    { name: "gatewayHeartbeat", start: startGatewayHeartbeat }, // home/+/gateway/+/heartbeat (Broker MQTT, TLS)
    { name: "secretSealer", start: startSecretSealer }, // mã hoá dần secret_key còn dạng rõ (FR-12.8, cần DEVICE_SECRET_KEY)
  ],
};
