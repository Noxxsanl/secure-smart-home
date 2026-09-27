"use client";

import useSWR from "swr";
import { AtSign, Home, LogOut, Mail, MapPin, Phone } from "lucide-react";
import Skeleton from "@smarthome/shared/ui/Skeleton";
import StatusBadge from "@smarthome/shared/ui/StatusBadge";
import { useAuth, useCurrentUser } from "@smarthome/shared/auth/hooks/useAuth";
import { getMyProfile, MEMBER_ROLE_LABELS } from "@smarthome/shared/mock/portal";
import { useCurrentHome } from "@/features/home/providers/CurrentHomeProvider";

export default function ProfilePage() {
  const user = useCurrentUser();
  const { logout } = useAuth();
  const { customerId, homes, current, selectHome } = useCurrentHome();
  const { data: profile, isLoading } = useSWR(["/portal/profile", customerId], () => getMyProfile(customerId));

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <div className="flex items-center gap-4 rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-xl font-bold text-white">
          {user.display_name[0]}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">{user.display_name}</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400">Tên đăng nhập: {user.username}</p>
        </div>
        <button
          type="button" onClick={() => logout()}
          className="inline-flex items-center gap-1.5 rounded border border-gray-200 dark:border-slate-600 px-3.5 py-1.5 text-sm font-semibold text-gray-600 dark:text-slate-300 transition hover:bg-gray-50 dark:hover:bg-slate-700"
        >
          <LogOut className="h-4 w-4" /> Đăng xuất
        </button>
      </div>

      <section className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
        <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-slate-100">Thông tin liên hệ</h2>
        {isLoading || !profile ? (
          <div className="space-y-2"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-5 w-1/2" /></div>
        ) : (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="flex items-center gap-2 text-gray-700 dark:text-slate-300"><AtSign className="h-4 w-4 text-gray-400" /><dt className="sr-only">Mã người dùng</dt><dd>{profile.user_tag}</dd></div>
            <div className="flex items-center gap-2 text-gray-700 dark:text-slate-300"><Mail className="h-4 w-4 text-gray-400" /><dt className="sr-only">Email</dt><dd>{profile.email}</dd></div>
            <div className="flex items-center gap-2 text-gray-700 dark:text-slate-300"><Phone className="h-4 w-4 text-gray-400" /><dt className="sr-only">Điện thoại</dt><dd>{profile.phone}</dd></div>
            <div className="flex items-center gap-2 text-gray-700 dark:text-slate-300"><MapPin className="h-4 w-4 text-gray-400" /><dt className="sr-only">Địa chỉ</dt><dd>{profile.address}</dd></div>
          </dl>
        )}
        <p className="mt-3 text-xs text-gray-400 dark:text-slate-500">
          Mã người dùng dùng khi cần bộ phận hỗ trợ gán nhà cho bạn. Không chia sẻ mật khẩu cho bất kỳ ai, kể cả nhân viên hỗ trợ.
        </p>
      </section>

      <section className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800">
        <h2 className="border-b border-gray-100 dark:border-slate-700 px-5 py-3 text-sm font-semibold text-gray-900 dark:text-slate-100">
          Nhà của tôi ({homes.length})
        </h2>
        <ul className="divide-y divide-gray-100 dark:divide-slate-700">
          {homes.map((h) => (
            <li key={h.home.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <Home className="h-4 w-4 text-gray-400" />
              <div className="min-w-48 flex-1">
                <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{h.home.name}</p>
                <p className="text-xs text-gray-400 dark:text-slate-500">
                  {MEMBER_ROLE_LABELS[h.role]} · {h.online_count}/{h.device_count} thiết bị online
                </p>
              </div>
              <StatusBadge status={h.home.status} />
              {current?.home.id === h.home.id ? (
                <span className="text-xs font-semibold text-brand">Đang chọn</span>
              ) : (
                <button type="button" onClick={() => selectHome(h.home.id)} className="text-xs font-semibold text-gray-500 hover:text-brand">
                  Chuyển sang nhà này
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
