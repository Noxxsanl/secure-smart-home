// Dòng đọc từ read model khách hàng → DTO console (Customer) và lịch sử kích hoạt (ActivationRecord).
import { toIso, toIsoRequired } from "../../../infrastructure/database/db";
import type { ActivationRecord } from "../../homes";
import type { Customer } from "./console-identity.types";

export interface CustomerRow {
  id: number;
  user_id: number;
  full_name: string;
  user_tag: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  created_at: Date;
  user_status: "active" | "locked";
  last_login: Date | null;
  homes_count: unknown;
}

export function toCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.full_name,
    user_tag: row.user_tag,
    email: row.email,
    phone: row.phone,
    address: row.address,
    joined_at: toIsoRequired(row.created_at),
    status: row.user_status === "active" ? "active" : "inactive",
    homes_count: Number(row.homes_count ?? 0),
    last_login: toIso(row.last_login),
  };
}

export interface ActivationRow {
  id: number;
  customer_id: number | null;
  customer_name: string | null;
  home_id: number | null;
  home_name: string | null;
  created_at: Date;
  result: "success" | "failed";
  method: "qr" | "code" | "operator_assign";
  reason: string | null;
}

export function toActivation(row: ActivationRow): ActivationRecord {
  return {
    id: row.id,
    customer_id: row.customer_id,
    customer_name: row.customer_name,
    home_id: row.home_id,
    home_name: row.home_name,
    activated_at: toIsoRequired(row.created_at),
    result: row.result,
    method: row.method,
    reason: row.reason,
  };
}
