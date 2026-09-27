"use client";

import { useContext } from "react";
import AuthContext from "@smarthome/shared/auth/providers/AuthProvider";

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

// Người dùng hiện tại, chỉ gọi bên trong <AuthGuard> (nơi đã chắc chắn có phiên).
export function useCurrentUser() {
  const { user } = useAuth();
  if (!user) {
    throw new Error("useCurrentUser must be used within AuthGuard");
  }
  return user;
}
