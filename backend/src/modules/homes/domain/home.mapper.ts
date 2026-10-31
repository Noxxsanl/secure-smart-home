// HomeRow → Home DTO (CONTRACT_V2 §3). Một chỗ duy nhất để Customer API và Dashboard API trả
// cùng một hình dạng Home.
import { toIso, toIsoRequired } from "../../../infrastructure/database/db";
import type { Home, HomeRow } from "./home.types";

export function toHome(row: HomeRow): Home {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    package: row.package_code,
    status: row.status,
    timezone: row.timezone,
    owner_customer_id: row.owner_customer_id,
    gateway_id: row.gateway_id,
    activated_at: toIso(row.claimed_at),
    created_at: toIsoRequired(row.created_at),
  };
}
