"use client";

import Link from "next/link";
import { KeyRound } from "lucide-react";
import { useAuth } from "@smarthome/shared/auth/hooks/useAuth";

// FR-1.6 (COULD) chưa làm: chưa có OTP email/SMS. Trang này nói thật cách lấy
// lại quyền truy cập thay vì giả lập "đã gửi liên kết".
export default function ForgotPasswordPage() {
  const { portal } = useAuth();
  const isCustomerPortal = portal.role === "user";

  return (
    <main className="min-h-screen bg-[#F6F8FB] px-4 py-10 text-gray-900 dark:bg-slate-900 dark:text-slate-100">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md flex-col justify-center">
        <section className="rounded-2xl border border-[#E5EAF0] bg-white p-8 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-10">
          <div className="mb-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft">
              <KeyRound className="h-6 w-6 text-brand" />
            </div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500">Khôi phục tài khoản</p>
            <h1 className="mt-2 text-2xl font-semibold text-gray-900 dark:text-slate-100">Quên mật khẩu</h1>
          </div>

          {isCustomerPortal ? (
            <div className="space-y-3 text-sm text-gray-600 dark:text-slate-300">
              <p>
                Tính năng tự đặt lại mật khẩu qua email/SMS <strong>chưa được hỗ trợ</strong> trong phiên bản này.
              </p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>Nếu bạn vẫn đang đăng nhập ở một trình duyệt khác, hãy vào <strong>Hồ sơ → Đổi mật khẩu</strong>.</li>
                <li>
                  Nếu không, hãy liên hệ bộ phận hỗ trợ khách hàng, cung cấp email đã đăng ký và mã người dùng (dạng
                  <span className="font-mono"> ten#1234</span>, xem ở trang Hồ sơ) để được hỗ trợ đặt lại mật khẩu.
                </li>
              </ul>
              <p className="text-xs text-gray-400 dark:text-slate-500">
                Nhân viên hỗ trợ không bao giờ hỏi mật khẩu của bạn.
              </p>
            </div>
          ) : (
            <div className="space-y-3 text-sm text-gray-600 dark:text-slate-300">
              <p>Tài khoản nhân viên do quản trị viên cấp và quản lý.</p>
              <p>
                Vui lòng <strong>liên hệ quản trị viên</strong> của hệ thống để được đặt lại mật khẩu. Không gửi mật khẩu qua
                tin nhắn hay email.
              </p>
            </div>
          )}

          <Link
            href={portal.loginPath}
            className="mt-8 inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Quay lại đăng nhập
          </Link>
        </section>
      </div>
    </main>
  );
}
