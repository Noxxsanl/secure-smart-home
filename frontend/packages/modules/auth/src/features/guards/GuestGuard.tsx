"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../api/useAuth";
import { FullPageSpinner } from "@shh/ui";

// Trang login / đăng ký / quên mật khẩu: đã có phiên hợp lệ (đã qua /me) thì
// chuyển thẳng về trang chủ của app. Proxy chỉ nhìn cookie; guard này nhìn
// phiên thật, nên cookie cũ đã vô hiệu vẫn thấy được form đăng nhập.
export default function GuestGuard({ children }: { children: React.ReactNode }) {
  const { user, portal } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) router.replace(portal.homePath);
  }, [user, router, portal.homePath]);

  if (user) return <FullPageSpinner />;
  return <>{children}</>;
}
