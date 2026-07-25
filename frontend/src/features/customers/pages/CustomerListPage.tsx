"use client";

import { useState } from "react";
import Link from "next/link";
import { UserCircle, Search, Eye } from "lucide-react";
import { useCustomers } from "@/features/customers/hooks/useCustomers";
import StatusBadge from "@/shared/ui/StatusBadge";
import EmptyState from "@/shared/ui/EmptyState";

export default function CustomerListPage() {
  const { customers, isLoading } = useCustomers();
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? customers.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.phone.includes(search) ||
        c.user_tag.toLowerCase().includes(search.toLowerCase())
      )
    : customers;

  return (
    <div className="w-full space-y-3">
      <div>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Customers</h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">Danh sách khách hàng đã đăng ký và Smart Home họ sở hữu.</p>
      </div>

      <div className="overflow-hidden rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="flex items-center gap-2.5 border-b border-gray-200 dark:border-slate-700 bg-[#F4F5F7] dark:bg-slate-900 px-4 py-2.5">
          <div className="relative min-w-48 max-w-72 flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
            <input
              type="text" placeholder="Tìm theo tên, SĐT hoặc User ID…"
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-full rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 pl-8 pr-3 text-sm text-gray-900 dark:text-slate-100 placeholder:text-gray-300 dark:placeholder:text-slate-500 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
            />
          </div>
          <span className="ml-auto text-xs text-gray-400 dark:text-slate-500">
            <span className="font-semibold text-gray-700 dark:text-slate-300">{filtered.length}</span> khách hàng
          </span>
        </div>

        {!isLoading && filtered.length === 0 ? (
          <EmptyState icon={UserCircle} title="Không tìm thấy khách hàng nào" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-slate-700 bg-[#F4F5F7] dark:bg-slate-900">
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Khách hàng</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">SĐT / Email</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Smart Home</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Tham gia</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Trạng thái</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {filtered.map((c) => (
                  <tr key={c.id} className="bg-white dark:bg-slate-800 hover:bg-brand-soft/30">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 dark:text-slate-100">{c.name}</p>
                      <p className="font-mono text-xs text-gray-400 dark:text-slate-500">{c.user_tag}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400">{c.phone} · {c.email}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">{c.homesCount}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400">{new Date(c.joined_at).toLocaleDateString("vi-VN")}</td>
                    <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                    <td className="px-4 py-3">
                      <Link href={`/customers/${c.id}`} className="inline-flex items-center gap-1 rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-slate-300 transition hover:border-brand hover:bg-brand-soft hover:text-brand">
                        <Eye className="h-3 w-3" /> Chi tiết
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
