// Module simulator: thiết bị ảo cho is_simulated=1 (đóng vai firmware + broker khi demo không có phần cứng).
// Công cụ demo: bật/tắt nguồn thiết bị ảo và "mở cửa" cho cảm biến cửa ảo. Chỉ tác động dòng is_simulated=1.
// Ngoại lệ có chủ đích của quy tắc "không ghi bảng của module khác" — xem tools/check-architecture.mjs.
import { Router } from "express";
import type { AppModule } from "../../shared/module";
import { getSimulatorStatusController } from "./features/get-simulator-status/get-simulator-status.controller";
import { simulateDevicePowerController } from "./features/simulate-device-power/simulate-device-power.controller";
import { simulateDoorController } from "./features/simulate-door/simulate-door.controller";
import { startSimulator } from "./features/simulator-engine/simulator-engine.job";

export const simulatorModule: AppModule = {
  name: "simulator",
  dashboard: (router) => {
    const simulator = Router();
    simulator.get("/status", getSimulatorStatusController);
    simulator.post("/devices/:id/power", simulateDevicePowerController);
    // Cảm biến cửa ảo: đẩy một số đo { door_open } qua đúng hook như thiết bị thật
    simulator.post("/devices/:id/door", simulateDoorController);
    router.use("/simulator", simulator);
  },
  workers: [{ name: "simulator", start: startSimulator }],
};
