// Module stats: số liệu tổng hợp cho Dashboard (badge, thống kê Operator/Admin). Không sở hữu bảng — đọc qua
// index của module khác và read model của mình.
import { Router } from "express";
import type { AppModule } from "../../shared/module";
import { getAdminStatsController } from "./features/get-admin-stats/get-admin-stats.controller";
import { getBadgesController } from "./features/get-badges/get-badges.controller";
import { getOperatorStatsController } from "./features/get-operator-stats/get-operator-stats.controller";

export const statsModule: AppModule = {
  name: "stats",
  dashboard: (router) => {
    const stats = Router();
    stats.get("/badges", getBadgesController);
    stats.get("/operator", getOperatorStatsController);
    stats.get("/admin", getAdminStatsController);
    router.use("/stats", stats);
  },
};
