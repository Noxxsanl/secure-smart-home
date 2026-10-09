"use client";

import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { mutate as mutateGlobalCache } from "swr";
import { apiErrorCode, configureApi } from "@smarthome/shared/api/http";
import { FetchError } from "@smarthome/shared/api/errors";
import type { PortalConfig, RegisterInput, User } from "@smarthome/shared/auth/types";
import { reauthLoginPath, type SessionEndReason } from "@smarthome/shared/auth/session";
import {
  getUser,
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
} from "@smarthome/shared/auth/api/auth.api";
import FullPageSpinner from "@smarthome/shared/ui/FullPageSpinner";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  portal: PortalConfig;
  /** Trang đăng nhập kèm lý do phiên kết thúc — AuthGuard chuyển tới đây khi mất phiên. */
  loginRedirect: string;
  login: (identifier: string, password: string) => Promise<void>;
  /** Chỉ cổng khách hàng. Thành công thì đã có phiên và chuyển về trang chủ. */
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  /** Tải lại thông tin người dùng (VD sau khi đổi họ tên ở trang hồ sơ). */
  refreshUser: () => Promise<void>;
  /** Cho request tự xử lý 401 (`skipAuthRedirect`) báo rằng phiên đã hết hạn. */
  expireSession: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ portal, children }: { portal: PortalConfig; children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [endReason, setEndReason] = useState<SessionEndReason>("expired");
  // Nhiều request SWR có thể cùng nhận 401 — chỉ xử lý hết phiên một lần.
  const expiringRef = useRef(false);
  // Lời gọi logout "dọn cookie" đang chạy: login mới phải chờ nó xong, nếu không
  // Set-Cookie xoá phiên cũ có thể về sau và xoá luôn phiên vừa tạo.
  const pendingLogoutRef = useRef<Promise<void> | null>(null);

  // Cookie phiên là HttpOnly nên JS không tự xoá được — nhờ backend xoá (best effort).
  const clearServerCookie = useCallback(() => {
    const pending = apiLogout(portal.role).catch(() => undefined);
    pendingLogoutRef.current = pending;
    return pending;
  }, [portal.role]);

  const endClientSession = useCallback((reason: SessionEndReason) => {
    setEndReason(reason);
    setUser(null);
    // Xoá cache SWR mặc định để người đăng nhập sau (có thể là người khác) không
    // thấy dữ liệu của phiên trước. Cổng khách hàng còn dùng cache riêng theo phiên.
    void mutateGlobalCache(() => true, undefined, { revalidate: false });
  }, []);

  const expireSession = useCallback(
    (reason: SessionEndReason = "expired") => {
      if (expiringRef.current) return;
      expiringRef.current = true;
      void clearServerCookie();
      endClientSession(reason);
      router.replace(reauthLoginPath(portal, reason));
    },
    [clearServerCookie, endClientSession, router, portal]
  );

  // Cấu hình HTTP client trước request đầu tiên: effect này khai báo trước
  // effect khôi phục phiên (React chạy effect theo thứ tự khai báo), và con của
  // provider chưa render (spinner) cho tới khi kiểm tra phiên xong.
  useEffect(() => {
    configureApi({ portal: portal.role, onUnauthorized: () => expireSession("expired") });
  }, [portal.role, expireSession]);

  // Khôi phục phiên của đúng cổng này qua /me. Spinner chặn render nội dung
  // private cho tới khi biết kết quả, tránh nháy giao diện.
  useEffect(() => {
    let cancelled = false;
    getUser(portal.role)
      .then((me) => {
        if (cancelled) return;
        expiringRef.current = false;
        setUser(me);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const code = apiErrorCode(err);
        if (code === "ACCOUNT_LOCKED") {
          setEndReason("locked");
          void clearServerCookie();
        } else if (err instanceof FetchError && err.status === 0) {
          setEndReason("offline");
        } else if (err instanceof FetchError && err.status === 401 && code !== "NO_TOKEN") {
          // Cookie còn nhưng phiên vô hiệu (hết hạn / đổi secret) → dọn cookie để
          // proxy không tiếp tục coi là đã đăng nhập.
          void clearServerCookie();
        }
        setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [portal.role, clearServerCookie]);

  const login = useCallback(
    async (identifier: string, password: string) => {
      await pendingLogoutRef.current;
      const authUser = await apiLogin(portal.role, identifier, password);
      expiringRef.current = false;
      setUser(authUser);
      router.replace(portal.homePath);
    },
    [router, portal.role, portal.homePath]
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      if (portal.role !== "user") throw new Error("register chỉ dùng cho cổng khách hàng");
      await pendingLogoutRef.current;
      const authUser = await apiRegister(input);
      expiringRef.current = false;
      setUser(authUser);
      router.replace(portal.homePath);
    },
    [router, portal.role, portal.homePath]
  );

  const logout = useCallback(async () => {
    // Bỏ qua các 401 của request đang bay trong lúc đăng xuất.
    expiringRef.current = true;
    try {
      await apiLogout(portal.role);
    } catch {
      // Mất mạng: vẫn kết thúc phiên phía client. `?reauth=logout` giúp proxy
      // không đẩy ngược về trang chủ nếu cookie chưa xoá được.
    }
    endClientSession("logout");
    router.replace(reauthLoginPath(portal, "logout"));
  }, [endClientSession, router, portal]);

  const refreshUser = useCallback(async () => {
    try {
      setUser(await getUser(portal.role));
    } catch {
      // Giữ thông tin cũ; nếu phiên thật sự hết hạn, request kế tiếp sẽ nhận 401.
    }
  }, [portal.role]);

  const loginRedirect = reauthLoginPath(portal, endReason);

  const value = useMemo(
    () => ({
      user, loading, portal, loginRedirect, login, register, logout, refreshUser,
      expireSession: () => expireSession("expired"),
    }),
    [user, loading, portal, loginRedirect, login, register, logout, refreshUser, expireSession]
  );

  if (loading) return <FullPageSpinner />;

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthContext;
