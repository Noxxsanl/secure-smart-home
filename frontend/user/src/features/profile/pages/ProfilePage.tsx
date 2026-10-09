"use client";

import { Home, LogOut } from "lucide-react";
import Skeleton from "@smarthome/shared/ui/Skeleton";
import StatusBadge from "@smarthome/shared/ui/StatusBadge";
import { useAuth, useCurrentUser } from "@smarthome/shared/auth/hooks/useAuth";
import type { HomeStatus } from "@/lib/api/types";
import { useProfile } from "@/lib/api/profile";
import { formatDate } from "@/lib/format";
import { MEMBER_ROLE_LABELS } from "@/lib/roles";
import ErrorPanel from "@/widgets/ErrorPanel";
import { useCurrentHome } from "@/features/home/providers/CurrentHomeProvider";
import ChangePasswordCard from "@/features/profile/components/ChangePasswordCard";
import ProfileInfoCard from "@/features/profile/components/ProfileInfoCard";

const HOME_STATUS_LABELS: Record<HomeStatus, string> = {
  active: "Đang hoạt động",
  suspended: "Tạm ngưng",
  unclaimed: "Chưa kích hoạt",
};

export default function ProfilePage() {
  const user = useCurrentUser();
  const { logout, refreshUser } = useAuth();
  const { homes, current, selectHome } = useCurrentHome();
  const { data: profile, error, mutate } = useProfile();

  const name = profile?.full_name ?? user.display_name;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <div className="flex items-center gap-4 rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand text-xl font-bold uppercase text-white">
          {name[0] ?? "?"}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold text-gray-900 dark:text-slate-100">{name}</h1>
          <p className="truncate text-sm text-gray-500 dark:text-slate-400">{user.email ?? user.username}</p>
        </div>
        <button
          type="button" onClick={() => logout()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded border border-gray-200 dark:border-slate-600 px-3.5 py-1.5 text-sm font-semibold text-gray-600 dark:text-slate-300 transition hover:bg-gray-50 dark:hover:bg-slate-700"
        >
          <LogOut className="h-4 w-4" /> Đăng xuất
        </button>
      </div>

      {profile ? (
        <ProfileInfoCard
          profile={profile}
          onSaved={async () => {
            await Promise.all([mutate(), refreshUser()]);
          }}
        />
      ) : error ? (
        <ErrorPanel error={error} onRetry={() => mutate()} />
      ) : (
        <section className="space-y-2 rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
        </section>
      )}

      <ChangePasswordCard />

      <section className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800">
        <h2 className="border-b border-gray-100 dark:border-slate-700 px-5 py-3 text-sm font-semibold text-gray-900 dark:text-slate-100">
          Nhà của tôi ({homes.length})
        </h2>
        {homes.length === 0 ? (
          <p className="px-5 py-4 text-sm text-gray-500 dark:text-slate-400">
            Bạn chưa có Smart Home nào. Vào “Thêm Smart Home” để kích hoạt kit bằng Activation Code.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-slate-700">
            {homes.map((h) => (
              <li key={h.home.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <Home className="h-4 w-4 text-gray-400" />
                <div className="min-w-48 flex-1">
                  <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{h.home.name}</p>
                  <p className="text-xs text-gray-400 dark:text-slate-500">
                    {MEMBER_ROLE_LABELS[h.role]} · {h.online_count}/{h.device_count} thiết bị online
                    {h.role === "GUEST" && h.expires_at ? ` · quyền khách đến ${formatDate(h.expires_at)}` : ""}
                  </p>
                </div>
                <StatusBadge status={h.home.status} label={HOME_STATUS_LABELS[h.home.status]} />
                {current?.home.id === h.home.id ? (
                  <span className="text-xs font-semibold text-brand">Đang chọn</span>
                ) : (
                  <button type="button" onClick={() => selectHome(h.home.id)} className="text-xs font-semibold text-gray-500 hover:text-brand dark:text-slate-400">
                    Chuyển sang nhà này
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
