"use client";

import { Home } from "lucide-react";
import { MEMBER_ROLE_LABELS } from "@smarthome/shared/mock/portal";
import { useCurrentHome } from "@/features/home/providers/CurrentHomeProvider";

export default function HomeSwitcher() {
  const { homes, current, selectHome } = useCurrentHome();
  if (!current) return null;

  return (
    <label className="flex h-10 items-center gap-2 rounded border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-3 pr-1 text-sm">
      <Home className="h-4 w-4 shrink-0 text-brand" />
      <span className="sr-only">Chọn nhà</span>
      <select
        value={current.home.id}
        onChange={(e) => selectHome(Number(e.target.value))}
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
