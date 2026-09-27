import type { Metadata } from "next";
import "./globals.css";
import AppProviders from "@smarthome/shared/app-shell/AppProviders";
import { PORTAL } from "@/config/portal";

export const metadata: Metadata = {
  title: PORTAL.name,
  description: "Cổng vận hành Smart Home dành cho Operator.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning bắt buộc vì next-themes ghi attribute `class` lên <html>
    // sau khi hydration để áp dụng theme đã lưu, nếu không React sẽ báo lỗi hydration mismatch.
    <html lang="vi" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-screen bg-[#F6F8FB] dark:bg-slate-900 text-gray-900 dark:text-slate-100">
        <AppProviders portal={PORTAL}>{children}</AppProviders>
      </body>
    </html>
  );
}
