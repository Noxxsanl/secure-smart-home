"use client";

import { Settings as SettingsIcon, Home, Cpu } from "lucide-react";
import { CATEGORY_LABELS, ROOM_TYPE_LABELS } from "@smarthome/console/lib/labels";

// Trang cấu hình hệ thống CHƯA nối backend: danh mục dưới đây là giá trị cố định theo hợp đồng V2
// (chỉ để tra cứu), chưa có API đọc/ghi cấu hình — chỉnh sửa danh mục là hạng mục phase sau.
export default function SettingsPage() {
  return (
    <div className="w-full space-y-3">
      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-gray-900 dark:text-slate-100">
          Settings
          <span
            title="Trang này chưa có API backend — chỉ hiển thị danh mục cố định."
            className="rounded bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning ring-1 ring-warning/30"
          >
            Chưa nối backend
          </span>
        </h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">
          Danh mục hệ thống hiện tại (chỉ xem). Chỉnh sửa danh mục (thêm/sửa Room Type, Device Category, MQTT Broker) là hạng mục mở rộng ở phase sau.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Home className="h-4 w-4 text-brand" />
            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Room Types</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {Object.values(ROOM_TYPE_LABELS).map((label) => (
              <span key={label} className="rounded bg-gray-100 dark:bg-slate-700 px-2 py-1 text-xs font-medium text-gray-600 dark:text-slate-300">
                {label}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Cpu className="h-4 w-4 text-brand" />
            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Device Categories</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {Object.values(CATEGORY_LABELS).map((label) => (
              <span key={label} className="rounded bg-gray-100 dark:bg-slate-700 px-2 py-1 text-xs font-medium text-gray-600 dark:text-slate-300">
                {label}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-4 sm:col-span-2">
          <div className="mb-2 flex items-center gap-2">
            <SettingsIcon className="h-4 w-4 text-brand" />
            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">MQTT Broker</p>
          </div>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Broker 2 chỉ nhận kết nối TLS (cổng 8883) — chi tiết cấu hình chưa hiển thị ở trang này.
          </p>
        </div>
      </div>
    </div>
  );
}
