"use client";

import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { PortalConfig, User } from "@smarthome/shared/auth/types";
import { getUser, login as apiLogin, logout as apiLogout } from "@smarthome/shared/auth/api/auth.api";
import FullPageSpinner from "@smarthome/shared/ui/FullPageSpinner";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  portal: PortalConfig;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ portal, children }: { portal: PortalConfig; children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Khôi phục phiên của đúng role app này khi mount. Spinner chặn render các
  // component con cho đến khi kiểm tra session xong, tránh flash nội dung private.
  useEffect(() => {
    getUser(portal.role)
      .then(setUser)
      .finally(() => setLoading(false));
  }, [portal.role]);

  const login = useCallback(
    async (username: string, password: string) => {
      const authUser = await apiLogin(portal.role, username, password);
      setUser(authUser);
      router.replace(portal.homePath);
    },
    [router, portal.role, portal.homePath]
  );

  const logout = useCallback(async () => {
    await apiLogout(portal.role);
    setUser(null);
    router.replace(portal.loginPath);
  }, [router, portal.role, portal.loginPath]);

  const value = useMemo(
    () => ({ user, loading, portal, login, logout }),
    [user, loading, portal, login, logout]
  );

  if (loading) return <FullPageSpinner />;

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthContext;
