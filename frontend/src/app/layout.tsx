import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/features/auth/providers/AuthProvider";
import { ThemeProvider } from "next-themes";

export const metadata: Metadata = {
  title: "Smart Home",
  description: "IoT device management admin panel.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning bắt buộc vì next-themes ghi attribute `class` lên <html>
    // sau khi hydration để áp dụng theme đã lưu, nếu không React sẽ báo lỗi hydration mismatch.
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-screen bg-[#F6F8FB] dark:bg-slate-900 text-gray-900 dark:text-slate-100">
        {/* ThemeProvider phải bọc ngoài AuthProvider để context theme có sẵn
            bên trong spinner loading mà AuthProvider hiển thị khi kiểm tra session. */}
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
