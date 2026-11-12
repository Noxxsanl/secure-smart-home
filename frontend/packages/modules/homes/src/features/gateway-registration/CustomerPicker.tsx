"use client";

import { useState } from "react";
import { RefreshCw, Search, UserCircle, X } from "lucide-react";
import { errorMessage, useCustomerSearch } from "@shh/api-client/dashboard";
import type { Customer } from "@shh/api-client/dashboard";
import { useDebouncedValue } from "@shh/utils";

type CustomerPickerProps = {
  selected: Customer | null;
  onSelect: (customer: Customer | null) => void;
  disabled?: boolean;
};

// Tìm tài khoản khách hàng (GET /customers?q= — tên, User ID, email, SĐT) để gắn gateway.
export default function CustomerPicker({ selected, onSelect, disabled }: CustomerPickerProps) {
  const [search, setSearch] = useState("");
  const query = useDebouncedValue(search.trim(), 300);
  const { data, error, isLoading } = useCustomerSearch(query);
  const results = data ?? [];

  if (selected) {
    return (
      <div className="flex items-start justify-between gap-3 rounded border border-brand/30 bg-brand-soft/40 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-slate-100">
            {selected.name} <span className="font-mono text-xs text-gray-500 dark:text-slate-400">({selected.user_tag})</span>
          </p>
          <p className="truncate text-xs text-gray-500 dark:text-slate-400">
            {[selected.email, selected.phone].filter(Boolean).join(" · ") || "Chưa có thông tin liên hệ"} · {selected.homes_count} nhà
          </p>
        </div>
        <button
          type="button"
          onClick={() => onSelect(null)}
          disabled={disabled}
          className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand hover:brightness-90 disabled:opacity-50"
        >
          <X className="h-3 w-3" /> Đổi khách hàng
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
        <input
          id="register-customer-search"
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={disabled}
          placeholder="Tìm theo tên, email, SĐT hoặc User ID (VD: dat#4821)"
          className="h-9 w-full rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 pl-8 pr-3 text-sm text-gray-900 dark:text-slate-100 outline-none placeholder:text-gray-300 dark:placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/15"
        />
      </div>
      {query.length < 2 ? (
        <p className="text-xs text-gray-400 dark:text-slate-500">
          Nhập ít nhất 2 ký tự. Khách hàng tự tạo tài khoản ở cổng khách hàng (Đăng ký) hoặc trên ứng dụng di động.
        </p>
      ) : (
        <div className="max-h-56 overflow-y-auto rounded border border-gray-100 dark:border-slate-700">
          {error ? (
            <p className="px-3 py-4 text-center text-sm text-critical">{errorMessage(error)}</p>
          ) : isLoading && results.length === 0 ? (
            <p className="flex items-center justify-center gap-2 px-3 py-4 text-sm text-gray-400 dark:text-slate-500">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Đang tìm…
            </p>
          ) : results.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-gray-400 dark:text-slate-500">
              Không tìm thấy khách hàng nào. Nhờ khách đăng ký tài khoản trước, rồi tìm lại.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-slate-700">
              {results.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(c)}
                    disabled={disabled || c.status !== "active"}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-gray-50 dark:hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <UserCircle className="h-5 w-5 shrink-0 text-gray-400 dark:text-slate-500" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-slate-100">{c.name}</p>
                      <p className="truncate text-xs text-gray-400 dark:text-slate-500">
                        <span className="font-mono">{c.user_tag}</span>
                        {c.email ? ` · ${c.email}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-gray-400 dark:text-slate-500">
                      {c.status === "active" ? `${c.homes_count} nhà` : "Đã khoá"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
