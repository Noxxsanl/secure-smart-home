// Module automation: luật IF/THEN của khách, engine chạy luật, màn quản trị luật.
// Sở hữu automation_rules, automation_history.
import { Router } from "express";
import type { AppModule } from "../../shared/module";
import { createAutomationController } from "./features/create-automation/create-automation.controller";
import { deleteAutomationController } from "./features/delete-automation/delete-automation.controller";
import { getAutomationHistoryController } from "./features/get-automation-history/get-automation-history.controller";
import { listAutomationsController } from "./features/list-automations/list-automations.controller";
import { listConsoleAutomationsController } from "./features/list-console-automations/list-console-automations.controller";
import { startAutomationEngine } from "./features/run-automation-engine/run-automation-engine.job";
import { toggleAutomationController } from "./features/toggle-automation/toggle-automation.controller";
import { updateAutomationController } from "./features/update-automation/update-automation.controller";

export const automationModule: AppModule = {
  name: "automation",
  // /api/dashboard/automation — read-mostly; chỉ ADMIN bật/tắt (kiểm trong handler)
  dashboard: (router) => {
    const automation = Router();
    automation.get("/", listConsoleAutomationsController);
    automation.patch("/:id", toggleAutomationController);
    router.use("/automation", automation);
  },
  // /api/portal + /api/mobile (CONTRACT §4.2)
  customer: (router) => {
    router.get("/homes/:homeId/automations", listAutomationsController);
    router.post("/homes/:homeId/automations", createAutomationController);
    router.patch("/automations/:ruleId", updateAutomationController);
    router.delete("/automations/:ruleId", deleteAutomationController);
    router.get("/automations/:ruleId/history", getAutomationHistoryController);
  },
  workers: [{ name: "automationEngine", start: startAutomationEngine }],
};
