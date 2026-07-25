"use client";

import { Smartphone } from "lucide-react";
import { useAuth } from "@/features/auth/hooks/useAuth";

const ALLOWED_ROLES = ["admin", "operator"];

// Dashboard is ADMIN/OPERATOR only — end customers use the Mobile app.
// Today's backend only ever issues admin/operator sessions, but this guard
// keeps the rule enforced on the UI itself per the doc's explicit requirement,
// in case a future role (e.g. "user") is ever returned by /api/auth/me.
export default function RoleGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading || !user) return <>{children}</>;

  if (!ALLOWED_ROLES.includes(user.role)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft">
          <Smartphone className="h-6 w-6 text-brand" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Vui lòng sử dụng ứng dụng di động</h1>
          <p className="mt-1.5 max-w-sm text-sm text-gray-500 dark:text-slate-400">
            Cổng quản trị này chỉ dành cho Admin và Operator. Khách hàng vui lòng quản lý Smart Home qua Mobile App.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
