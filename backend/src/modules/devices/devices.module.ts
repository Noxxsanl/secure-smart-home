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
import { getDeviceDetailController } from "./features/get-device-detail/get-device-detail.controller";
import { getGatewayDetailController } from "./features/get-gateway-detail/get-gateway-detail.controller";
import { listConsoleDevicesController } from "./features/list-console-devices/list-console-devices.controller";
import { listGatewaySensorsController } from "./features/list-gateway-sensors/list-gateway-sensors.controller";
import { listGatewaysController } from "./features/list-gateways/list-gateways.controller";
import { startDeviceMonitor } from "./features/presence-monitor/presence-monitor.job";
import { removeDeviceController } from "./features/remove-device/remove-device.controller";
import { renameDeviceController } from "./features/rename-device/rename-device.controller";
import { setDeviceStatusController } from "./features/set-device-status/set-device-status.controller";
import { startMqttTracker } from "./features/track-device-ip/track-device-ip.consumer";
import { updateDeviceController } from "./features/update-device/update-device.controller";

export const devicesModule: AppModule = {
  name: "devices",
  device: (router) => {
    const sensors = Router();
    sensors.get("/", listGatewaySensorsController); // gateway lấy danh sách sensor được phép (Gateway HMAC)
    router.use("/sensors", sensors);
  },
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
    { name: "mqttTracker", start: startMqttTracker }, // theo dõi log $SYS broker để cập nhật IP thiết bị
  ],
};
