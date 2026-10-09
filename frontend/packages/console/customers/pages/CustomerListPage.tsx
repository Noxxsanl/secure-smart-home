"use client";

import { useState } from "react";
import Link from "next/link";
import { UserCircle, Search, Eye, RefreshCw } from "lucide-react";
import { useCustomers } from "@smarthome/console/customers/hooks/useCustomers";
import { LoadErrorBar } from "@smarthome/console/components/PageStates";
import StatusBadge from "@smarthome/shared/ui/StatusBadge";
import EmptyState from "@smarthome/shared/ui/EmptyState";
import { useDebouncedValue } from "@smarthome/console/lib/hooks";
import { formatDate, formatRelative } from "@smarthome/console/lib/format";
import { BTN_SM, CARD, MUTED_DASH, SEARCH_INPUT, TABLE_HEAD_ROW, TH, TOOLBAR, TR } from "@smarthome/console/lib/ui";

export default function CustomerListPage() {
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search, 300);
  const { customers, isLoading, isValidating, error, refresh } = useCustomers(q);

  return (
    <div className="w-full space-y-3">
      <div>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Customers</h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">
          Danh sách khách hàng đã đăng ký trên ứng dụng và Smart Home họ sở hữu.
        </p>
      </div>

      <div className={`overflow-hidden ${CARD}`}>
        <div className={TOOLBAR}>
          <div className="relative min-w-48 max-w-72 flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Tìm theo tên, SĐT, email hoặc User ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={SEARCH_INPUT}
            />
          </div>
          <span className="ml-auto flex items-center gap-2 text-xs text-gray-400 dark:text-slate-500">
            {isLoading || (isValidating && customers.length === 0)
              ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Đang tải…</>
              : <span><span className="font-semibold text-gray-700 dark:text-slate-300">{customers.length}</span> khách hàng</span>}
          </span>
        </div>

        {!!error && <LoadErrorBar error={error} onRetry={() => void refresh()} />}

        {!isLoading && customers.length === 0 ? (
          <EmptyState
            icon={UserCircle}
            title={q ? "Không tìm thấy khách hàng phù hợp" : "Chưa có khách hàng nào"}
            description={q ? "Thử tên khác, SĐT, email hoặc User ID dạng tên#1234." : "Khách hàng xuất hiện ở đây sau khi đăng ký tài khoản trên ứng dụng."}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto text-left text-sm">
              <thead>
                <tr className={TABLE_HEAD_ROW}>
                  <th className={TH}>Khách hàng</th>
                  <th className={TH}>SĐT / Email</th>
                  <th className={TH}>Smart Home</th>
                  <th className={TH}>Tham gia</th>
                  <th className={TH}>Đăng nhập gần nhất</th>
                  <th className={TH}>Trạng thái</th>
                  <th className={TH} />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {customers.map((c) => (
                  <tr key={c.id} className={TR}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 dark:text-slate-100">{c.name}</p>
                      <p className="font-mono text-xs text-gray-400 dark:text-slate-500">{c.user_tag}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400">
                      {c.phone || <span className={MUTED_DASH}>—</span>}
                      {c.email && <p className="text-xs text-gray-400 dark:text-slate-500">{c.email}</p>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">{c.homes_count}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400">{formatDate(c.joined_at)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400">{formatRelative(c.last_login, "Chưa đăng nhập")}</td>
                    <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                    <td className="px-4 py-3">
                      <Link href={`/customers/${c.id}`} className={BTN_SM}>
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
