"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { User, Lock, Mail } from "lucide-react";
import { useAuth } from "@smarthome/shared/auth/hooks/useAuth";
import { DEMO_ACCOUNT_HINTS } from "@smarthome/shared/auth/demoAccounts";
import { loginErrorMessage } from "@smarthome/shared/auth/errors";
import { parseSessionEndReason, REAUTH_PARAM, type SessionEndReason } from "@smarthome/shared/auth/session";
import { PORTAL_LABELS } from "@smarthome/shared/auth/types";
import AuthSplitLayout, { AuthError, AuthField } from "@smarthome/shared/auth/components/AuthSplitLayout";

const REAUTH_MESSAGES: Record<SessionEndReason, { text: string; tone: "info" | "warn" }> = {
  logout: { text: "Bạn đã đăng xuất.", tone: "info" },
  expired: { text: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", tone: "warn" },
  locked: { text: "Tài khoản đã bị khoá nên phiên đăng nhập bị kết thúc. Liên hệ hỗ trợ để được mở khoá.", tone: "warn" },
  offline: { text: "Không kết nối được máy chủ để kiểm tra phiên. Kiểm tra mạng rồi đăng nhập lại.", tone: "warn" },
};

// Đọc `?reauth=` bằng useSearchParams — phải nằm trong <Suspense> để trang
// login vẫn prerender được (Next 16).
function ReauthNotice() {
  const reason = parseSessionEndReason(useSearchParams().get(REAUTH_PARAM));
  if (!reason) return null;
  const { text, tone } = REAUTH_MESSAGES[reason];
  return (
    <p
      role="status"
      className={`mb-4 rounded-2xl px-5 py-2 text-center text-sm ${
        tone === "warn" ? "border border-amber-200 bg-amber-50 text-amber-700" : "bg-[#f4f4f4] text-[#666666]"
      }`}
    >
      {text}
    </p>
  );
}

export default function LoginPage() {
  const { login, portal } = useAuth();
  const isCustomerPortal = portal.role === "user";
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!identifier.trim() || !password) {
      setError(isCustomerPortal ? "Vui lòng nhập email và mật khẩu." : "Vui lòng nhập tên đăng nhập và mật khẩu.");
      return;
    }

    setIsSubmitting(true);
    try {
      await login(identifier.trim(), password);
      // Khi thành công, AuthProvider.login() chuyển về trang chủ của app.
    } catch (err) {
      setError(loginErrorMessage(err, portal.role));
      setIsSubmitting(false);
    }
  };

  return (
    <AuthSplitLayout title={portal.name} subtitle={`Đăng nhập vào ${PORTAL_LABELS[portal.role]}`}>
      <Suspense fallback={null}>
        <ReauthNotice />
      </Suspense>

      <form onSubmit={handleSubmit} className="space-y-3" noValidate>
        <AuthField
          icon={isCustomerPortal ? Mail : User}
          id="identifier"
          name={isCustomerPortal ? "email" : "username"}
          // Cổng khách: ô Email cũng nhận mã người dùng (VD dat#4821) nên để type text.
          type="text"
          inputMode={isCustomerPortal ? "email" : undefined}
          autoComplete="username"
          aria-label={isCustomerPortal ? "Email" : "Tên đăng nhập"}
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder={isCustomerPortal ? "Email" : "Tên đăng nhập"}
          required
        />

        <AuthField
          icon={Lock}
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          aria-label="Mật khẩu"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mật khẩu"
          required
        />

        <AuthError message={error} />

        <div className="pt-5">
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex h-12.5 w-full items-center justify-center rounded-full bg-blue-600 text-[15px] font-bold uppercase tracking-wide text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
        </div>
      </form>

      <Link href="/forgot-password" className="mt-4 text-center text-xs font-medium text-[#888888] hover:text-blue-600">
        Quên mật khẩu?
      </Link>

      {isCustomerPortal && (
        <p className="mt-3 text-center text-xs text-[#888888]">
          Chưa có tài khoản?{" "}
          <Link href="/register" className="font-semibold text-blue-600 hover:text-blue-700">
            Đăng ký
          </Link>
        </p>
      )}

      {/* Tài khoản demo do backend seed khi chạy dev (SEED_DEMO_DATA). */}
      <div className="mt-6 rounded-2xl bg-[#f4f4f4] px-5 py-3 text-center text-xs text-[#888888]">
        <p className="font-semibold text-[#666666]">Tài khoản demo</p>
        <p className="mt-1 break-all font-mono">{DEMO_ACCOUNT_HINTS[portal.role]}</p>
      </div>
    </AuthSplitLayout>
  );
}
