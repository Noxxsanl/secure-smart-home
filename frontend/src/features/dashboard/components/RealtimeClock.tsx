"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

const DAYS = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export default function RealtimeClock() {
  // Khởi tạo null để tránh lỗi SSR/hydration mismatch: server render nothing,
  // client mới set thời gian thực trong useEffect sau khi mount.
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) return null;

  const day   = DAYS[now.getDay()];
  const date  = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
  const time  = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  return (
    <div className="rounded-md border border-[#E5EAF0] bg-white p-4">
      <div className="flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5 text-gray-400" />
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Thời gian hệ thống</p>
      </div>
      <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-gray-900">{time}</p>
      <p className="mt-1 text-sm font-medium text-gray-500">{day}, {date}</p>
    </div>
  );
}
