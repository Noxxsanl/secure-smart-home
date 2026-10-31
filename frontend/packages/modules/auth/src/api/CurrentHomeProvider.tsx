"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { useCurrentUser } from "./useAuth";
import { useMyHomes } from "./myHomes.api";
import type { MyHome } from "@shh/api-client/portal";
import { permissionsFor, type HomePermissions } from "../model/homeRoles";

type CurrentHomeContextValue = {
  homes: MyHome[];
  current: MyHome | null;
  /** Quyền suy ra từ role trong nhà đang chọn (CONTRACT §4.1) — chỉ để ẩn/khoá UI. */
  permissions: HomePermissions | null;
  isLoading: boolean;
  /** Lỗi tải danh sách nhà (mất mạng, máy chủ lỗi). */
  error: unknown;
  selectHome: (homeId: number) => void;
  /** Tải lại GET /homes (sau claim, chấp nhận lời mời, rời nhà…). */
  refresh: () => Promise<MyHome[] | undefined>;
  /** Nội dung thêm của màn hình "chưa có nhà" (HomeGate) — app truyền vào, VD lời mời đang chờ. */
  noHomeSlot: React.ReactNode;
};

const CurrentHomeContext = createContext<CurrentHomeContextValue | null>(null);

function storageKey(userId: number) {
  return `portal:selected_home:${userId}`;
}

function readStoredHome(userId: number): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    const id = raw ? Number(raw) : NaN;
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

// Khách hàng có thể là thành viên của nhiều nhà — mọi trang trong cổng làm
// việc trên "nhà đang chọn" (nhớ lựa chọn theo tài khoản trên trình duyệt này).
export function CurrentHomeProvider({ children, noHomeSlot = null }: { children: React.ReactNode; noHomeSlot?: React.ReactNode }) {
  const user = useCurrentUser();
  const { data, error, isLoading, mutate } = useMyHomes();
  const [selectedId, setSelectedId] = useState<number | null>(() => readStoredHome(user.id));

  const homes = data ?? [];
  // Nhà đã chọn không còn (bị xoá khỏi nhà, rời nhà, GUEST hết hạn) → về nhà đầu tiên.
  const current = homes.find((h) => h.home.id === selectedId) ?? homes[0] ?? null;

  const selectHome = useCallback(
    (homeId: number) => {
      setSelectedId(homeId);
      try {
        window.localStorage.setItem(storageKey(user.id), String(homeId));
      } catch {
        // Storage bị chặn (private mode) — lựa chọn chỉ giữ trong phiên.
      }
    },
    [user.id]
  );

  const refresh = useCallback(() => mutate(), [mutate]);

  return (
    <CurrentHomeContext.Provider
      value={{
        homes,
        current,
        permissions: current ? permissionsFor(current.role) : null,
        isLoading: isLoading && !data,
        error: data ? null : error,
        selectHome,
        refresh,
        noHomeSlot,
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
