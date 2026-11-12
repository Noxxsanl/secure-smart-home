// Module ai-usage: đo lường việc dùng LLM/STT của AI Agent — token, độ trễ, lỗi, chi phí theo bảng giá model,
// ngân sách ngày + tỷ giá. Sở hữu ai_usage_logs, ai_model_prices, ai_usage_settings.
// KHÔNG lưu nội dung prompt/câu trả lời (đề xuất AI Agent §8.3, bất biến 2).
//
// Bảng route (đường dẫn đầy đủ = tiền tố kênh + path):
//   service    POST /api/service/ai-usage                         AI Agent gửi số liệu (Bearer SERVICE_API_TOKEN)
//   dashboard  GET  /api/dashboard/ai-usage/summary?range=         Admin + Operator
//              GET  /api/dashboard/ai-usage/calls                  Admin + Operator
//              GET  /api/dashboard/ai-usage/prices                 Admin + Operator
//              POST /api/dashboard/ai-usage/prices[/sync], PUT|DELETE /prices/:id, PUT /settings   chỉ Admin
import { Router } from "express";
import type { AppModule } from "../../shared/module";
import { deleteModelPriceController } from "./features/delete-model-price/delete-model-price.controller";
import { getUsageSummaryController } from "./features/get-usage-summary/get-usage-summary.controller";
import { ingestUsageController } from "./features/ingest-usage/ingest-usage.controller";
import { listModelPricesController } from "./features/list-model-prices/list-model-prices.controller";
import { listUsageCallsController } from "./features/list-usage-calls/list-usage-calls.controller";
import {
  createModelPriceController,
  updateModelPriceController,
} from "./features/save-model-price/save-model-price.controller";
import { syncModelPricesController } from "./features/sync-model-prices/sync-model-prices.controller";
import { updateUsageSettingsController } from "./features/update-usage-settings/update-usage-settings.controller";

export const aiUsageModule: AppModule = {
  name: "ai-usage",
  service: (router) => {
    router.post("/ai-usage", ingestUsageController);
  },
  dashboard: (router) => {
    const usage = Router();
    usage.get("/summary", getUsageSummaryController);
    usage.get("/calls", listUsageCallsController);
    usage.get("/prices", listModelPricesController);
    usage.post("/prices/sync", syncModelPricesController);
    usage.post("/prices", createModelPriceController);
    usage.put("/prices/:id", updateModelPriceController);
    usage.delete("/prices/:id", deleteModelPriceController);
    usage.put("/settings", updateUsageSettingsController);
    router.use("/ai-usage", usage);
  },
};
