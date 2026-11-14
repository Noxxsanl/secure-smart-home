// Module telemetry: nhận số đo (HTTP fallback + MQTT gateway/+/data), lưu sensor_data, dọn dữ liệu cũ, đọc chuỗi số đo,
// tổng hợp khí hậu theo giờ sang telemetry_history (worker telemetryRollup). Sở hữu sensor_data, telemetry_history. Hai đường ingest phải giữ cùng logic xác thực (invariant 4):
//   HTTP: features/ingest-http (validate-device.middleware → ingest-http.controller/handler)
//   MQTT: features/ingest-mqtt (ingest-mqtt.consumer → ingest-mqtt.handler)
// cùng gọi verifyGatewayHMAC/verifyDeviceHMAC/registerAuthFailure của module devices và domain/ingest-common.
//
// Bảng route (thứ tự = route cũ). `GET /devices/:id/telemetry` của dashboard nằm cạnh router con /devices của
// module devices: router đó không có route khớp nên chuyển tiếp (next) tới đây.
import { Router } from "express";
import type { AppModule } from "../../shared/module";
import {
  getConsoleDeviceTelemetryController,
  getDeviceTelemetryController,
} from "./features/get-device-telemetry/get-device-telemetry.controller";
import { ingestHttpController } from "./features/ingest-http/ingest-http.controller";
import { validateDevice } from "./features/ingest-http/validate-device.middleware";
import { startMqttDataService } from "./features/ingest-mqtt/ingest-mqtt.consumer";
import { startRetentionJob } from "./features/purge-old-telemetry/purge-old-telemetry.job";
import { startTelemetryRollup } from "./features/rollup-telemetry/rollup-telemetry.job";

export const telemetryModule: AppModule = {
  name: "telemetry",
  device: (router) => {
    const data = Router();
    data.post("/", validateDevice, ingestHttpController); // HMAC 2 lớp gateway + sensor
    router.use("/data", data);
  },
  dashboard: (router) => {
    router.get("/devices/:id/telemetry", getConsoleDeviceTelemetryController);
  },
  customer: (router) => {
    router.get("/devices/:deviceId/telemetry", getDeviceTelemetryController);
  },
  workers: [
    { name: "mqttDataService", start: startMqttDataService }, // subscribe gateway/+/data trên Broker MQTT
    { name: "retentionJob", start: startRetentionJob }, // purge-old-telemetry
    { name: "telemetryRollup", start: startTelemetryRollup }, // rollup-telemetry: sensor_data → telemetry_history theo giờ
  ],
};
