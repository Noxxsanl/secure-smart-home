"use client";

import { Settings as SettingsIcon, Home, Cpu } from "lucide-react";
import { rooms, devices } from "@/shared/mock/seed";

export default function SettingsPage() {
  const roomTypes = Array.from(new Set(rooms.map((r) => r.room_type)));
  const deviceCategories = Array.from(new Set(devices.map((d) => d.category)));

  return (
    <div className="w-full space-y-3">
      <div>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Settings</h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">
          Danh mục hệ thống hiện tại. Quản lý chỉnh sửa danh mục (thêm/sửa Room Type, Device Category, MQTT Broker) là hạng mục mở rộng ở phase sau.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Home className="h-4 w-4 text-brand" />
            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Room Types</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {roomTypes.map((t) => (
              <span key={t} className="rounded bg-gray-100 dark:bg-slate-700 px-2 py-1 text-xs font-medium capitalize text-gray-600 dark:text-slate-300">
                {t.replace("_", " ")}
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
            {deviceCategories.map((c) => (
              <span key={c} className="rounded bg-gray-100 dark:bg-slate-700 px-2 py-1 text-xs font-medium capitalize text-gray-600 dark:text-slate-300">
                {c.replace("_", " ")}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-4 sm:col-span-2">
          <div className="mb-2 flex items-center gap-2">
            <SettingsIcon className="h-4 w-4 text-brand" />
            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">MQTT Broker</p>
          </div>
          <p className="text-sm text-gray-500 dark:text-slate-400">mqtt://broker-1.smarthome.local:8883 (TLS) — cấu hình chi tiết chưa khả dụng trong bản mock này.</p>
        </div>
      </div>
    </div>
  );
}
