"use client";

import { useState } from "react";
import Link from "next/link";
import Panel from "@smarthome/console/components/Panel";
import LogTable from "@smarthome/console/logs/components/LogTable";
import { LoadErrorBar } from "@smarthome/console/components/PageStates";
import { useStaffRole } from "@smarthome/console/auth/usePermissions";
import { useLogEntries } from "@smarthome/console/logs/hooks/useLogEntries";
import { logCategoriesFor } from "@smarthome/console/logs/config";
import { SELECT_SM } from "@smarthome/console/lib/ui";
import type { LogCategory } from "@smarthome/console/api/types";

const PAGE_LIMIT = 30;

type HomeLogPanelProps = {
  homeId: number;
  /** Nhà chưa kích hoạt: mở sẵn Provision Log thay vì Device Log. */
  defaultCategory?: LogCategory;
};

// Tab "Log" của Smart Home — GET /logs/:category?home_id=. Operator chỉ chọn được 5 loại
// vận hành; Admin chọn đủ 10 loại. Xem đầy đủ + lọc nâng cao ở trang Logs.
export default function HomeLogPanel({ homeId, defaultCategory = "device" }: HomeLogPanelProps) {
  const categories = logCategoriesFor(useStaffRole());
  const [category, setCategory] = useState<LogCategory>(defaultCategory);
  const { logs, total, isLoading, error, refresh } = useLogEntries(
    category,
    { home_id: homeId, limit: PAGE_LIMIT },
    { keepPrevious: false }
  );

  return (
    <Panel
      title="Log của Smart Home này"
      subtitle="Sự kiện gắn với nhà, mới nhất trước."
      action={
        <select
          aria-label="Loại log"
          value={category}
          onChange={(e) => setCategory(e.target.value as LogCategory)}
          className={SELECT_SM}
        >
          {categories.map((c) => <option key={c.category} value={c.category}>{c.label}</option>)}
        </select>
      }
    >
      {!!error && <LoadErrorBar error={error} onRetry={() => void refresh()} />}
      {isLoading && logs.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-gray-400 dark:text-slate-500">Đang tải log…</p>
      ) : (
        <LogTable
          logs={logs}
          emptyTitle="Chưa có log nào cho nhà này"
          emptyDescription="Loại log này chưa ghi nhận sự kiện của nhà — thử chọn loại khác."
        />
      )}
      {total > logs.length && (
        <div className="border-t border-gray-100 dark:border-slate-700 px-4 py-2.5 text-xs text-gray-500 dark:text-slate-400">
          Đang hiển thị {logs.length}/{total} dòng mới nhất.{" "}
          <Link href={`/logs/${category}`} className="font-semibold text-brand hover:brightness-90">
            Mở Log Center để lọc và xem tiếp →
          </Link>
        </div>
      )}
    </Panel>
  );
}
