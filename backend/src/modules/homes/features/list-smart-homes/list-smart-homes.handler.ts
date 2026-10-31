// GET /smart-homes — danh sách nhà cho console (CONTRACT_V2 §5).
import type { HomeListFilter, SmartHomeRow } from "../../domain/console-home.types";
import { listHomeRows } from "../../infrastructure/smart-homes.read-model";

export async function listSmartHomes(filter: HomeListFilter): Promise<SmartHomeRow[]> {
  return listHomeRows(filter);
}
