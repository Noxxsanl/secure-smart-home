"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@smarthome/shared/auth/hooks/useAuth";
import FullPageSpinner from "@smarthome/shared/ui/FullPageSpinner";

// Trang login / quên mật khẩu: đã có phiên thì chuyển thẳng về trang chủ của app.
export default function GuestGuard({ children }: { children: React.ReactNode }) {
  const { user, portal } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) router.replace(portal.homePath);
  }, [user, router, portal.homePath]);

  if (user) return <FullPageSpinner />;
  return <>{children}</>;
}
