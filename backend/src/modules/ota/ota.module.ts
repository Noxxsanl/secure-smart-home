// Module ota: phiên bản firmware và đợt triển khai OTA. Sở hữu firmware, ota_jobs, ota_history.
import express, { Router } from "express";
import type { AppModule } from "../../shared/module";
import { createDeploymentController } from "./features/create-deployment/create-deployment.controller";
import { listDeploymentsController } from "./features/list-deployments/list-deployments.controller";
import { listFirmwareController } from "./features/list-firmware/list-firmware.controller";
import { rollbackDeploymentController } from "./features/rollback-deployment/rollback-deployment.controller";
import { updateFirmwareController } from "./features/update-firmware/update-firmware.controller";
import { adminOnly, uploadFirmwareController } from "./features/upload-firmware/upload-firmware.controller";

export const otaModule: AppModule = {
  name: "ota",
  dashboard: (router) => {
    const firmware = Router();
    firmware.get("/", listFirmwareController);
    // express.raw chỉ gắn ở route upload (body nhị phân ≤ 4 MB); phần còn lại của API vẫn bị giới hạn 10 KB JSON.
    // adminOnly đứng TRƯỚC express.raw: không ADMIN thì không đọc body.
    firmware.post("/", adminOnly, express.raw({ type: "application/octet-stream", limit: "4mb" }), uploadFirmwareController);
    firmware.patch("/:id", updateFirmwareController);
    router.use("/firmware", firmware);

    const ota = Router();
    ota.get("/deployments", listDeploymentsController);
    ota.post("/deployments", createDeploymentController);
    ota.post("/deployments/:id/rollback", rollbackDeploymentController);
    router.use("/ota", ota);
  },
};
