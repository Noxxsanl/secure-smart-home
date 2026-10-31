// Module control: lệnh điều khiển thiết bị/gateway qua MQTT + ack, lệnh OTA, lịch sử thao tác.
// Sở hữu device_commands, user_behavior_logs.
//
// Bảng route:
//   POST /api/portal|mobile/devices/:deviceId/commands          send-device-command (khách; cần channel để ghi nguồn hành vi)
//   POST /api/dashboard/gateways/:id/restart | /factory-reset   send-gateway-command (console; 202 { command_id })
// Route /gateways/:id/** nằm cạnh router con /gateways của module devices: router đó chỉ có GET / và GET /:id nên
// POST không khớp và được chuyển tiếp (next) tới đây.
import type { AppModule } from "../../shared/module";
import { startCommandAckListener } from "./features/command-ack/command-ack.consumer";
import { sendDeviceCommandController } from "./features/send-device-command/send-device-command.controller";
import { sendGatewayCommandController } from "./features/send-gateway-command/send-gateway-command.controller";

export const controlModule: AppModule = {
  name: "control",
  dashboard: (router) => {
    router.post("/gateways/:id/restart", sendGatewayCommandController("restart"));
    router.post("/gateways/:id/factory-reset", sendGatewayCommandController("factory_reset"));
  },
  customer: (router, channel) => {
    router.post("/devices/:deviceId/commands", sendDeviceCommandController(channel));
  },
  workers: [{ name: "commandAckListener", start: startCommandAckListener }], // subscribe ack lệnh (Broker 2, TLS)
};
