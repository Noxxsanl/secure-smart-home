"use client";

import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@/features/auth/types";
import { AUTH_ROUTES } from "@/features/auth/routes";
import { getUser, login as apiLogin, logout as apiLogout } from "@/features/auth/api/auth.api";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Khôi phục trạng thái auth khi mount bằng cách gọi /api/auth/me.
  // Spinner loading chặn render các component con cho đến khi kiểm tra session xong,
  // tránh các trang private bị flash nội dung chưa xác thực trước khi middleware redirect.
  useEffect(() => {
    getUser()
      .then(setUser)
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(
    async (username: string, password: string) => {
      const authUser = await apiLogin(username, password);
      setUser(authUser);
      router.replace(AUTH_ROUTES.dashboard);
    },
    [router]
  );

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
    router.replace(AUTH_ROUTES.login);
  }, [router]);

  const value = useMemo(
    () => ({ user, loading, login, logout }),
    [user, loading, login, logout]
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F6F8FB]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-blue-600" />
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthContext;
