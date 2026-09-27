"use client";

import { createContext, useCallback, useContext, useState } from "react";
import useSWR from "swr";
import { useCurrentUser } from "@smarthome/shared/auth/hooks/useAuth";
import { listMyHomes, permissionsFor, type HomePermissions, type MyHome } from "@smarthome/shared/mock/portal";

const STORAGE_KEY = "portal:selected_home";

type CurrentHomeContextValue = {
  customerId: number;
  homes: MyHome[];
  current: MyHome | null;
  permissions: HomePermissions | null;
  isLoading: boolean;
  selectHome: (homeId: number) => void;
  refreshHomes: () => Promise<unknown>;
};

const CurrentHomeContext = createContext<CurrentHomeContextValue | null>(null);

function readStoredHome(): number | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

// Khách hàng có thể là thành viên của nhiều nhà — mọi trang trong cổng làm
// việc trên "nhà đang chọn" (nhớ lựa chọn theo trình duyệt).
export function CurrentHomeProvider({ children }: { children: React.ReactNode }) {
  const user = useCurrentUser();
  const customerId = user.customer_id ?? -1;
  const { data, isLoading, mutate } = useSWR(["/portal/homes", customerId], () => listMyHomes(customerId));
  const [selectedId, setSelectedId] = useState<number | null>(() =>
    typeof window === "undefined" ? null : readStoredHome()
  );

  const homes = data ?? [];
  const current = homes.find((h) => h.home.id === selectedId) ?? homes[0] ?? null;

  const selectHome = useCallback((homeId: number) => {
    setSelectedId(homeId);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(homeId));
    } catch {
      // ignore — lựa chọn chỉ giữ trong phiên
    }
  }, []);

  return (
    <CurrentHomeContext.Provider
      value={{
        customerId,
        homes,
        current,
        permissions: current ? permissionsFor(current.role) : null,
        isLoading,
        selectHome,
        refreshHomes: () => mutate(),
      }}
    >
      {children}
    </CurrentHomeContext.Provider>
  );
}

export function useCurrentHome() {
  const ctx = useContext(CurrentHomeContext);
  if (!ctx) throw new Error("useCurrentHome must be used within CurrentHomeProvider");
  return ctx;
}
