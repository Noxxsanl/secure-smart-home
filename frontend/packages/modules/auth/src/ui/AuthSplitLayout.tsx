import type { LucideIcon } from "lucide-react";

// Khung 2 cột (ảnh minh hoạ + form) của trang đăng nhập / đăng ký — tách ra để
// hai trang giữ đúng một thiết kế.
export default function AuthSplitLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-linear-to-bl from-[#c850c0] to-[#4158d0] p-4">
      <div className="flex w-full max-w-240 overflow-hidden rounded-[10px] bg-white shadow-2xl">
        {/* Left — illustration */}
        <div className="hidden shrink-0 items-center justify-center p-16 md:flex md:w-[55%]">
          {/* eslint-disable-next-line @next/next/no-img-element -- ảnh tĩnh nhỏ, không cần tối ưu */}
          <img src="/img-01.webp" alt="Minh hoạ Smart Home" className="max-w-full" />
        </div>

        {/* Right — form */}
        <div className="flex w-full flex-col justify-center px-10 py-14 md:w-[45%] md:px-14 lg:px-16">
          <h1
            className="text-center text-2xl font-bold text-[#333333]"
            style={{ fontFamily: "Poppins-Bold, sans-serif" }}
          >
            {title}
          </h1>
          <p className="mb-10 mt-2 text-center text-sm text-[#888888]">{subtitle}</p>
          {children}
        </div>
      </div>
    </main>
  );
}

type AuthFieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  icon: LucideIcon;
};

// Ô nhập bo tròn có icon bên trái — giữ nguyên style của form đăng nhập cũ.
export function AuthField({ icon: Icon, className = "", ...props }: AuthFieldProps) {
  return (
    <div className="relative">
      <input
        {...props}
        className={`peer h-12.5 w-full rounded-full bg-[#e6e6e6] pl-17 pr-6 text-[15px] text-[#666666] outline-none transition placeholder:text-[#999999] focus:ring-4 focus:ring-blue-600/30 ${className}`}
      />
      <span className="pointer-events-none absolute left-8.75 top-1/2 -translate-y-1/2 text-[#666666] transition-all peer-focus:text-blue-600">
        <Icon size={15} />
      </span>
    </div>
  );
}

export function AuthError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-5 py-2 text-center text-sm text-red-600">
      {message}
    </p>
  );
}
