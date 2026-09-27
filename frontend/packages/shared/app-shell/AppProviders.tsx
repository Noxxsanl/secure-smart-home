"use client";

import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@smarthome/shared/auth/providers/AuthProvider";
import type { PortalConfig } from "@smarthome/shared/auth/types";

// ThemeProvider phải bọc ngoài AuthProvider để context theme có sẵn bên trong
// spinner loading mà AuthProvider hiển thị khi kiểm tra session.
export default function AppProviders({ portal, children }: { portal: PortalConfig; children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AuthProvider portal={portal}>{children}</AuthProvider>
    </ThemeProvider>
  );
}
