"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { User, Lock } from "lucide-react";
import { useAuth } from "@smarthome/shared/auth/hooks/useAuth";
import { DEMO_ACCOUNT_HINTS } from "@smarthome/shared/auth/api/auth.api";
import { PORTAL_LABELS, type UserRole } from "@smarthome/shared/auth/types";
import { FetchError } from "@smarthome/shared/api/errors";

function loginErrorMessage(err: unknown): string {
  if (!(err instanceof FetchError)) return "Không thể kết nối đến máy chủ. Vui lòng thử lại.";
  if (err.status === 401) return "Sai tên đăng nhập hoặc mật khẩu.";
  if (err.status === 403) {
    const role = (err.data as { role?: UserRole } | null)?.role;
    return role
      ? `Tài khoản này thuộc ${PORTAL_LABELS[role]}. Vui lòng đăng nhập tại đúng cổng dành cho vai trò của bạn.`
      : "Tài khoản không được phép đăng nhập vào cổng này.";
  }
  // Rate limiter backend: 10 lần thử đăng nhập mỗi 15 phút theo IP
  if (err.status === 429) return "Quá nhiều lần thử. Vui lòng đợi 15 phút rồi thử lại.";
  return "Không thể kết nối đến máy chủ. Vui lòng thử lại.";
}

export default function LoginPage() {
  const { login, portal } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!username.trim() || !password) {
      setError("Vui lòng nhập tên đăng nhập và mật khẩu.");
      return;
    }

    setIsSubmitting(true);
    try {
      await login(username.trim(), password);
      // Khi thành công, AuthProvider.login() redirect đến trang chủ của app.
    } catch (err) {
      setError(loginErrorMessage(err));
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-linear-to-bl from-[#c850c0] to-[#4158d0] p-4">
      <div className="flex w-full max-w-[960px] overflow-hidden rounded-[10px] bg-white shadow-2xl">

        {/* Left — illustration */}
        <div className="hidden flex-shrink-0 items-center justify-center p-16 md:flex md:w-[55%]">
          {/* eslint-disable-next-line @next/next/no-img-element -- ảnh tĩnh nhỏ, không cần tối ưu */}
          <img src="/img-01.webp" alt="Minh hoạ Smart Home" className="max-w-full" />
        </div>

        {/* Right — form */}
        <div className="flex w-full flex-col justify-center px-10 py-14 md:w-[45%] md:px-14 lg:px-16">
          <h1
            className="text-center text-2xl font-bold text-[#333333]"
            style={{ fontFamily: "Poppins-Bold, sans-serif" }}
          >
            {portal.name}
          </h1>
          <p className="mb-10 mt-2 text-center text-sm text-[#888888]">
            Đăng nhập vào {PORTAL_LABELS[portal.role]}
          </p>

          <form onSubmit={handleSubmit} className="space-y-3" noValidate>
            <div className="relative">
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Tên đăng nhập"
                required
                className="peer h-[50px] w-full rounded-full bg-[#e6e6e6] pl-[68px] pr-6 text-[15px] text-[#666666] outline-none transition placeholder:text-[#999999] focus:ring-4 focus:ring-blue-600/30"
              />
              <span className="pointer-events-none absolute left-[35px] top-1/2 -translate-y-1/2 text-[#666666] transition-all peer-focus:text-blue-600">
                <User size={15} />
              </span>
            </div>

            <div className="relative">
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mật khẩu"
                required
                className="peer h-[50px] w-full rounded-full bg-[#e6e6e6] pl-[68px] pr-6 text-[15px] text-[#666666] outline-none transition placeholder:text-[#999999] focus:ring-4 focus:ring-blue-600/30"
              />
              <span className="pointer-events-none absolute left-[35px] top-1/2 -translate-y-1/2 text-[#666666] transition-all peer-focus:text-blue-600">
                <Lock size={15} />
              </span>
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-2xl border border-red-200 bg-red-50 px-5 py-2 text-center text-sm text-red-600"
              >
                {error}
              </p>
            )}

            <div className="pt-5">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex h-[50px] w-full items-center justify-center rounded-full bg-blue-600 text-[15px] font-bold uppercase tracking-wide text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Đang đăng nhập..." : "Đăng nhập"}
              </button>
            </div>
          </form>

          <Link href="/forgot-password" className="mt-4 text-center text-xs font-medium text-[#888888] hover:text-blue-600">
            Quên mật khẩu?
          </Link>

          {/* Demo account — login runs entirely on mock data */}
          <div className="mt-6 rounded-2xl bg-[#f4f4f4] px-5 py-3 text-center text-xs text-[#888888]">
            <p className="font-semibold text-[#666666]">Tài khoản demo</p>
            <p className="mt-1 font-mono">{DEMO_ACCOUNT_HINTS[portal.role]}</p>
          </div>
        </div>

      </div>
    </main>
  );
}
