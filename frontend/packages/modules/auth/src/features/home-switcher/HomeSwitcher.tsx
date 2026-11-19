"use client";

import { usePathname, useRouter } from "next/navigation";
import { Home } from "lucide-react";
import { MEMBER_ROLE_LABELS } from "../../model/homeRoles";
import { useCurrentHome } from "../../api/CurrentHomeProvider";

// Trang chi tiết phòng / thiết bị thuộc về một nhà cụ thể — đổi nhà thì quay về
// danh sách của mục đó thay vì để lại dữ liệu của nhà cũ trên màn hình.
const DETAIL_ROUTE = /^\/(rooms|devices)\/[^/]+$/;

export default function HomeSwitcher() {
  const { homes, current, selectHome } = useCurrentHome();
  const pathname = usePathname();
  const router = useRouter();
  if (!current) return null;

  function handleChange(homeId: number) {
    selectHome(homeId);
    const detail = DETAIL_ROUTE.exec(pathname);
    if (detail) router.push(`/${detail[1]}`);
  }

  return (
    <label className="flex h-10 items-center gap-2 rounded border border-gray-200 bg-white pl-3 pr-1 text-sm dark:border-slate-700 dark:bg-slate-800">
      <Home className="h-4 w-4 shrink-0 text-brand" />
      <span className="sr-only">Chọn nhà</span>
      <select
        value={current.home.id}
        onChange={(e) => handleChange(Number(e.target.value))}
        className="max-w-56 bg-transparent py-1 pr-1 font-medium text-gray-800 outline-none dark:text-slate-100 dark:[&>option]:bg-slate-800"
      >
        {homes.map((h) => (
          <option key={h.home.id} value={h.home.id}>
            {h.home.name} · {MEMBER_ROLE_LABELS[h.role]}
          </option>
        ))}
      </select>
    </label>
  );
}
