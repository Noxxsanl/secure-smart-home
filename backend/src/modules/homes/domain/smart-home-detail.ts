// Helper dùng chung của các feature Dashboard Smart Homes: tra nhà (404) và dựng SmartHomeDetailHome
// (HomeRow + tên chủ nhà/người tạo). Nhiều feature cùng cần nên nằm ở domain/.
import { notFound } from "../../../shared/errors/http-error";
import type { HomeRow } from "./home.types";
import type { SmartHomeDetailHome } from "./console-home.types";
import { toHome } from "./home.mapper";
import { getHomeRow } from "../infrastructure/home.read-model";
import { getHomeExtras } from "../infrastructure/smart-homes.read-model";

export async function toDetailHome(row: HomeRow): Promise<SmartHomeDetailHome> {
  const extras = await getHomeExtras(row.id);
  return { ...toHome(row), ...extras, expected_owner_name: row.expected_owner_name };
}

export async function requireHome(id: number): Promise<HomeRow> {
  const home = await getHomeRow(id);
  if (!home) throw notFound("Home not found");
  return home;
}
