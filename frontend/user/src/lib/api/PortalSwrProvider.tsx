"use client";

import { SWRConfig } from "swr";
import { PORTAL_SWR_CONFIG } from "@/lib/api/client";

// Khu vực đã đăng nhập dùng một cache SWR riêng, tạo mới mỗi lần vào (đăng nhập)
// và bỏ đi khi thoát ra (đăng xuất / hết phiên) — tài khoản đăng nhập sau không
// bao giờ thấy dữ liệu nhà của tài khoản trước.
export default function PortalSwrProvider({ children }: { children: React.ReactNode }) {
  return <SWRConfig value={{ ...PORTAL_SWR_CONFIG, provider: () => new Map() }}>{children}</SWRConfig>;
}
