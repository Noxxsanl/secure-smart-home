// Module audit: ghi (logEvent) và tra cứu nhật ký. Sở hữu audit_log.
import { Router } from "express";
import type { AppModule } from "../../shared/module";
import { deleteLogsController } from "./features/delete-logs/delete-logs.controller";
import { listLogsController } from "./features/list-logs/list-logs.controller";

export const auditModule: AppModule = {
  name: "audit",
  dashboard: (router) => {
    // Log Center (FR-10.1, 10.3, 10.4)
    const logs = Router();
    logs.get("/:category", listLogsController);
    logs.delete("/:category", deleteLogsController);
    router.use("/logs", logs);
  },
};
