// Module recommendations: gợi ý thói quen từ lịch sử thao tác. Gợi ý không bao giờ tự điều khiển thiết bị khi
// chưa được chấp nhận (invariant 8). Sở hữu recommendation_history, user_feedback.
import { Router } from "express";
import type { AppModule } from "../../shared/module";
import { requireDashboard } from "../identity";
import { acceptSuggestionController } from "./features/accept-suggestion/accept-suggestion.controller";
import { dismissSuggestionController } from "./features/dismiss-suggestion/dismiss-suggestion.controller";
import { listSuggestionsController } from "./features/list-suggestions/list-suggestions.controller";
import { runHabitSuggestionsController } from "./features/run-habit-suggestions/run-habit-suggestions.controller";
import { startHabitSuggestionJob } from "./features/run-habit-suggestions/run-habit-suggestions.job";

export const recommendationsModule: AppModule = {
  name: "recommendations",
  dashboard: (router) => {
    const ai = Router();
    // Chạy job gợi ý thói quen ngay (CONTRACT_V2 §5). Chỉ ADMIN: job quét mọi nhà của khách. Job không
    // bao giờ điều khiển thiết bị — chỉ tạo gợi ý pending cho khách quyết định (invariant 8).
    ai.post("/suggestions/run", requireDashboard("admin"), runHabitSuggestionsController);
    router.use("/ai", ai);
  },
  // /api/portal + /api/mobile (CONTRACT §4.2)
  customer: (router) => {
    router.get("/homes/:homeId/suggestions", listSuggestionsController);
    router.post("/suggestions/:id/accept", acceptSuggestionController);
    router.post("/suggestions/:id/dismiss", dismissSuggestionController);
  },
  workers: [{ name: "habitSuggestionJob", start: startHabitSuggestionJob }],
};
