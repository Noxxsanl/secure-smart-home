"use client";

import Link from "next/link";
import { QrCode } from "lucide-react";
import Skeleton from "@smarthome/shared/ui/Skeleton";
import type { MyHome } from "@smarthome/shared/mock/portal";
import { useCurrentHome } from "@/features/home/providers/CurrentHomeProvider";

// Trang nào cũng cần "nhà đang chọn": đang tải → skeleton, chưa có nhà nào →
// hướng dẫn thêm Smart Home, có nhà → render nội dung.
export default function HomeGate({ children }: { children: (home: MyHome) => React.ReactNode }) {
  const { current, isLoading } = useCurrentHome();

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!current) {
    return (
      <div className="mx-auto mt-16 flex max-w-md flex-col items-center rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft">
          <QrCode className="h-6 w-6 text-brand" />
        </div>
        <h1 className="mt-4 text-lg font-semibold text-gray-900 dark:text-slate-100">Bạn chưa có Smart Home nào</h1>
        <p className="mt-1.5 text-sm text-gray-500 dark:text-slate-400">
          Nhập Activation Code in trên tem hộp Gateway để kích hoạt nhà, hoặc nhờ chủ nhà gửi lời mời cho bạn.
        </p>
        <Link href="/claim" className="mt-5 rounded bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:brightness-90">
          Thêm Smart Home
        </Link>
      </div>
    );
  }

  return <>{children(current)}</>;
}
