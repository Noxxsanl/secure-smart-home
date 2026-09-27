"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@smarthome/shared/auth/hooks/useAuth";
import { PORTAL_LABELS } from "@smarthome/shared/auth/types";
import FullPageSpinner from "@smarthome/shared/ui/FullPageSpinner";

// Bảo vệ toàn bộ route private của một app: chưa đăng nhập → về trang login;
// phiên thuộc role khác (không xảy ra với mock vì login đã chặn, nhưng giữ lại
// phòng khi /me của backend thật trả role khác) → chặn và hướng dẫn đúng cổng.
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, portal, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user) router.replace(portal.loginPath);
  }, [user, router, portal.loginPath]);

  if (!user) return <FullPageSpinner />;

  if (user.role !== portal.role) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas px-6 text-center dark:bg-slate-900">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft">
          <ShieldAlert className="h-6 w-6 text-brand" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Bạn đang ở sai cổng đăng nhập</h1>
          <p className="mt-1.5 max-w-sm text-sm text-gray-500 dark:text-slate-400">
            Tài khoản này thuộc {PORTAL_LABELS[user.role]}. Vui lòng đăng xuất và đăng nhập tại đúng cổng dành cho vai trò của bạn.
          </p>
        </div>
        <button
          type="button"
          onClick={() => logout()}
          className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-90"
        >
          Đăng xuất
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
