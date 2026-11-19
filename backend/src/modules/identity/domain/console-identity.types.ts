// DTO Dashboard của module identity (CONTRACT_V2 §5). Khớp frontend/packages/api-client/src/dashboard/types.ts.

export interface Customer {
  id: number;
  user_id: number;
  name: string;
  user_tag: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  joined_at: string;
  status: "active" | "inactive";
  homes_count: number;
  last_login: string | null;
}

export interface StaffAccount {
  id: number;
  username: string;
  role: "admin" | "operator";
  status: "active" | "locked";
  created_at: string;
  last_login: string | null;
}
