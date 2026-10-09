"use client";

import { useState } from "react";
import Link from "next/link";
import { Server, Search, Eye, RefreshCw } from "lucide-react";
import { useGateways } from "@smarthome/console/gateways/hooks/useGateways";
import { LoadErrorBar } from "@smarthome/console/components/PageStates";
import StatusBadge from "@smarthome/shared/ui/StatusBadge";
import EmptyState from "@smarthome/shared/ui/EmptyState";
import { formatRelative, formatRssi } from "@smarthome/console/lib/format";
import {
  BTN_SM, CARD, COUNT_PILL, MUTED_DASH, SEARCH_INPUT, SEGMENTED, TABLE_HEAD_ROW, TH, TOOLBAR, TR, segmentButton,
} from "@smarthome/console/lib/ui";

type Filter = "all" | "online" | "offline";

export default function GatewayListPage() {
  const { gateways, isLoading, isValidating, error, refresh } = useGateways();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  const needle = search.trim().toLowerCase();
  const filtered = gateways
    .filter((g) => filter === "all" || g.status === filter)
    .filter((g) => !needle || g.uid.toLowerCase().includes(needle) || (g.home_name ?? "").toLowerCase().includes(needle));

  const onlineCount = gateways.filter((g) => g.status === "online").length;
  const counts: Record<Filter, number> = { all: gateways.length, online: onlineCount, offline: gateways.length - onlineCount };
  const FILTERS: { value: Filter; label: string }[] = [
    { value: "all", label: "Tất cả" },
    { value: "online", label: "Online" },
    { value: "offline", label: "Offline" },
  ];

  return (
    <div className="w-full space-y-3">
      <div>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Gateway Fleet</h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">
          Theo dõi toàn bộ Gateway trên nền tảng — trạng thái, sóng WiFi, firmware và số Node đã ghép. Tự cập nhật mỗi 10 giây.
        </p>
      </div>

      <div className={`overflow-hidden ${CARD}`}>
        <div className={TOOLBAR}>
          <div className={SEGMENTED}>
            {FILTERS.map(({ value, label }) => (
              <button key={value} type="button" onClick={() => setFilter(value)} className={segmentButton(filter === value)}>
                {label} <span className={COUNT_PILL}>{counts[value]}</span>
              </button>
            ))}
          </div>
          <div className="relative min-w-48 max-w-72 flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Tìm theo Gateway UID hoặc tên nhà…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={SEARCH_INPUT}
            />
          </div>
          <span className="ml-auto flex items-center gap-2 text-xs text-gray-400 dark:text-slate-500">
            {isLoading || (isValidating && gateways.length === 0)
              ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Đang tải…</>
              : <span><span className="font-semibold text-gray-700 dark:text-slate-300">{filtered.length}</span> gateway</span>}
          </span>
        </div>

        {!!error && <LoadErrorBar error={error} onRetry={() => void refresh()} />}

        {!isLoading && filtered.length === 0 ? (
          <EmptyState
            icon={Server}
            title={gateways.length === 0 ? "Chưa có Gateway nào" : "Không tìm thấy gateway phù hợp"}
            description={gateways.length === 0 ? "Gateway xuất hiện ở đây sau khi tạo Smart Home mới." : "Thử đổi bộ lọc hoặc từ khoá."}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto text-left text-sm">
              <thead>
                <tr className={TABLE_HEAD_ROW}>
                  <th className={TH}>Gateway</th>
                  <th className={TH}>Smart Home</th>
                  <th className={TH}>Trạng thái</th>
                  <th className={TH}>Firmware</th>
                  <th className={TH}>RSSI</th>
                  <th className={TH}>Last seen</th>
                  <th className={TH}>Node</th>
                  <th className={TH}>Provision</th>
                  <th className={TH}>MQTT</th>
                  <th className={TH} />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {filtered.map((g) => (
                  <tr key={g.id} className={TR}>
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs text-gray-900 dark:text-slate-100">{g.uid}</p>
                      {g.is_simulated && (
                        <span className="mt-0.5 inline-block rounded bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 dark:text-slate-400">Mô phỏng</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {g.home_id && g.home_name
                        ? <Link href={`/smart-homes/${g.home_id}`} className="text-gray-700 dark:text-slate-300 hover:text-brand">{g.home_name}</Link>
                        : <span className="text-gray-400 dark:text-slate-500">Chưa gán nhà</span>}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={g.status} /></td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-slate-400">
                      {g.firmware_version ? `v${g.firmware_version}` : <span className={MUTED_DASH}>—</span>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-slate-400">{formatRssi(g.rssi)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-slate-400">{formatRelative(g.last_seen)}</td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-slate-300">
                      <span className="font-semibold">{g.paired_count}</span>/{g.node_count}
                      <span className="text-gray-400 dark:text-slate-500"> ghép · {g.device_count} thiết bị</span>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={g.provision_status} /></td>
                    <td className="px-4 py-3"><StatusBadge status={g.mqtt_status} /></td>
                    <td className="px-4 py-3">
                      <Link href={`/gateways/${g.id}`} className={BTN_SM}>
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
