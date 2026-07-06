"use client";

import { FormEvent, useState } from "react";
import { User, Lock } from "lucide-react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { FetchError } from "@/shared/api/errors";

export default function LoginPage() {
  const { login } = useAuth();
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
      // Khi thành công, AuthProvider.login() sẽ redirect đến /dashboard – không cần code ở đây
    } catch (err) {
      const status = err instanceof FetchError ? err.status : 0;
      if (status === 401) {
        setError("Sai tên đăng nhập hoặc mật khẩu.");
      } else if (status === 429) {
        // Rate limiter backend: 10 lần thử đăng nhập mỗi 15 phút theo IP
        setError("Quá nhiều lần thử. Vui lòng đợi và thử lại.");
      } else {
        setError("Không thể kết nối đến máy chủ. Vui lòng thử lại.");
      }
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-linear-to-bl from-[#c850c0] to-[#4158d0] p-4">
      <div className="flex w-full max-w-[960px] overflow-hidden rounded-[10px] bg-white shadow-2xl">

        {/* Left — illustration */}
        <div className="hidden flex-shrink-0 items-center justify-center p-16 md:flex md:w-[55%]">
          <img
            src="/img-01.webp"
            alt="Smart Home illustration"
            className="max-w-full"
          />
        </div>

        {/* Right — form */}
        <div className="flex w-full flex-col justify-center px-10 py-14 md:w-[45%] md:px-14 lg:px-16">
          <h1
            className="mb-12 text-center text-2xl font-bold text-[#333333]"
            style={{ fontFamily: "Poppins-Bold, sans-serif" }}
          >
            Smart Home
          </h1>

          <form onSubmit={handleSubmit} className="space-y-3" noValidate>
            {/* Username */}
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

            {/* Password */}
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

            {/* Error */}
            {error && (
              <p
                role="alert"
                className="rounded-full border border-red-200 bg-red-50 px-5 py-2 text-center text-sm text-red-600"
              >
                {error}
              </p>
            )}

            {/* Submit */}
            <div className="pt-5">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex h-[50px] w-full items-center justify-center rounded-full bg-blue-600 text-[15px] font-bold uppercase tracking-wide text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Đang đăng nhập..." : "Login"}
              </button>
            </div>
          </form>
        </div>

      </div>
    </main>
  );
}
