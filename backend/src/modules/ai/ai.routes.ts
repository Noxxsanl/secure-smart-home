// Router /api/dashboard/ai (đã nằm sau requireDashboard("admin", "operator") ở routes/index.ts).
import { Router } from "express";
import { requireDashboard } from "../auth/auth.middleware";
import { runHabitSuggestionsOnce } from "./habitSuggestion.job";

export function createAiRouter(): Router {
  const router = Router();

  // Chạy job gợi ý thói quen ngay (CONTRACT_V2 §5). Chỉ ADMIN: job quét mọi nhà của khách. Job không
  // bao giờ điều khiển thiết bị — chỉ tạo gợi ý pending cho khách quyết định (invariant 8).
  router.post("/suggestions/run", requireDashboard("admin"), async (_req, res) => {
    res.json(await runHabitSuggestionsOnce());
  });

  return router;
}
