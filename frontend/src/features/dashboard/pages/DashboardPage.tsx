"use client";

import { useAuth } from "@/features/auth/hooks/useAuth";
import AdminDashboardPage from "@/features/dashboard/pages/AdminDashboardPage";
import OperatorDashboardPage from "@/features/dashboard/pages/OperatorDashboardPage";

export default function DashboardPage() {
  const { user } = useAuth();
  return user?.role === "operator" ? <OperatorDashboardPage /> : <AdminDashboardPage />;
}
