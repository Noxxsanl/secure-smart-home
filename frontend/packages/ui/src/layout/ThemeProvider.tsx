"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

// Theme sáng/tối (class `dark` trên <html>), mặc định theo hệ điều hành. Phải
// bọc ngoài AuthProvider để spinner lúc kiểm tra phiên cũng có theme.
export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
    </NextThemesProvider>
  );
}
