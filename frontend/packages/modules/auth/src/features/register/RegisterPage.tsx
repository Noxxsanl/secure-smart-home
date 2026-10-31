"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Lock, Mail, Phone, ShieldCheck, User } from "lucide-react";
import { useAuth } from "../../api/useAuth";
import { registerErrorMessage, validateRegistration } from "../../model/errors";
import AuthSplitLayout, { AuthError, AuthField } from "../../ui/AuthSplitLayout";

// Đăng ký tài khoản khách hàng trên cổng web (CONTRACT §2.3). Backend tạo
// users + customers trong 1 transaction rồi set cookie phiên — thành công là
// đã đăng nhập, AuthProvider chuyển thẳng về trang chủ.
export default function RegisterPage() {
  const { register, portal } = useAuth();
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const update = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const invalid = validateRegistration(form);
    if (invalid) {
      setError(invalid);
      return;
    }

    setIsSubmitting(true);
    try {
      await register({
        full_name: form.full_name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        phone: form.phone.trim() || undefined,
      });
    } catch (err) {
      setError(registerErrorMessage(err));
      setIsSubmitting(false);
    }
  };

  return (
    <AuthSplitLayout title={portal.name} subtitle="Tạo tài khoản khách hàng để quản lý Smart Home của bạn">
      <form onSubmit={handleSubmit} className="space-y-3" noValidate>
        <AuthField
          icon={User} id="full_name" name="full_name" autoComplete="name" aria-label="Họ và tên"
          placeholder="Họ và tên" value={form.full_name} onChange={update("full_name")} maxLength={128} required
        />
        <AuthField
          icon={Mail} id="email" name="email" type="email" autoComplete="email" aria-label="Email"
          placeholder="Email" value={form.email} onChange={update("email")} maxLength={190} required
        />
        <AuthField
          icon={Phone} id="phone" name="phone" type="tel" autoComplete="tel" aria-label="Số điện thoại (không bắt buộc)"
          placeholder="Số điện thoại (không bắt buộc)" value={form.phone} onChange={update("phone")} maxLength={20}
        />
        <AuthField
          icon={Lock} id="password" name="password" type="password" autoComplete="new-password" aria-label="Mật khẩu"
          placeholder="Mật khẩu (tối thiểu 8 ký tự)" value={form.password} onChange={update("password")} maxLength={128} required
        />
        <AuthField
          icon={ShieldCheck} id="confirm" name="confirm" type="password" autoComplete="new-password" aria-label="Nhập lại mật khẩu"
          placeholder="Nhập lại mật khẩu" value={form.confirm} onChange={update("confirm")} maxLength={128} required
        />

        <AuthError message={error} />

        <div className="pt-4">
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex h-12.5 w-full items-center justify-center rounded-full bg-blue-600 text-[15px] font-bold uppercase tracking-wide text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Đang tạo tài khoản..." : "Đăng ký"}
          </button>
        </div>
      </form>

      <p className="mt-4 text-center text-xs text-[#888888]">
        Đã có tài khoản?{" "}
        <Link href={portal.loginPath} className="font-semibold text-blue-600 hover:text-blue-700">
          Đăng nhập
        </Link>
      </p>
      <p className="mt-3 text-center text-[11px] leading-relaxed text-[#999999]">
        Sau khi đăng ký, bạn có thể kích hoạt kit bằng Activation Code hoặc nhận lời mời từ chủ nhà.
      </p>
    </AuthSplitLayout>
  );
}
