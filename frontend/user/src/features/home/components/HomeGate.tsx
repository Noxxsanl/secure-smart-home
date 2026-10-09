"use client";

import Link from "next/link";
import { QrCode, WifiOff } from "lucide-react";
import Skeleton from "@smarthome/shared/ui/Skeleton";
import type { MyHome } from "@/lib/api/types";
import { portalErrorMessage } from "@/lib/errors";
import { useCurrentHome } from "@/features/home/providers/CurrentHomeProvider";
import MyInvitations from "@/features/members/components/MyInvitations";

// Trang nào cũng cần "nhà đang chọn": đang tải → skeleton, lỗi tải → hướng dẫn
// thử lại, chưa có nhà nào → lời mời đang chờ + hướng dẫn thêm Smart Home.
export default function HomeGate({ children }: { children: (home: MyHome) => React.ReactNode }) {
  const { current, isLoading, error, refresh } = useCurrentHome();

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!current && error) {
    return (
      <div className="mx-auto mt-16 flex max-w-md flex-col items-center rounded-md border border-[#E5EAF0] bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-800">
        <WifiOff className="h-8 w-8 text-gray-300 dark:text-slate-600" />
        <p className="mt-3 text-sm text-gray-600 dark:text-slate-300">{portalErrorMessage(error)}</p>
        <button
          type="button"
          onClick={() => refresh()}
          className="mt-4 rounded bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-90"
        >
          Thử lại
        </button>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="mx-auto mt-10 w-full max-w-xl space-y-4">
        <MyInvitations />
        <div className="flex flex-col items-center rounded-md border border-[#E5EAF0] bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-800">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft">
            <QrCode className="h-6 w-6 text-brand" />
          </div>
          <h1 className="mt-4 text-lg font-semibold text-gray-900 dark:text-slate-100">Bạn chưa có Smart Home nào</h1>
          <p className="mt-1.5 text-sm text-gray-500 dark:text-slate-400">
            Nhập Activation Code in trên tem hộp Gateway để kích hoạt nhà, hoặc nhờ chủ nhà gửi lời mời tới email
            của bạn — lời mời sẽ hiện ngay tại đây.
          </p>
          <Link href="/claim" className="mt-5 rounded bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-90">
            Thêm Smart Home
          </Link>
        </div>
      </div>
    );
  }

  return <>{children(current)}</>;
}
