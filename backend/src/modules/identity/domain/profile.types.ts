// Kiểu hồ sơ khách hàng (CONTRACT §4.2 Profile).

/** Dòng đọc từ users JOIN customers (joined_at là Date, DTO đổi sang ISO). */
export interface ProfileRow {
  customer_id: number;
  user_id: number;
  full_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  user_tag: string;
  joined_at: Date;
}

export interface Profile {
  customer_id: number;
  user_id: number;
  full_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  user_tag: string;
  joined_at: string;
}

/** Trường được sửa; undefined = không đụng, null (phone/address) = xoá giá trị. */
export interface ProfilePatch {
  fullName?: string;
  phone?: string | null;
  address?: string | null;
}
