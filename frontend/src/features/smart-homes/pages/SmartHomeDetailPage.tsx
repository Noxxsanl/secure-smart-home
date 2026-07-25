"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, MapPin, Calendar, Server, RefreshCw, Eye, Camera as CameraIcon, KeyRound,
} from "lucide-react";
import { useSmartHomeDetail } from "@/features/smart-homes/hooks/useSmartHomeDetail";
import RoomCard from "@/features/smart-homes/components/RoomCard";
import AssignOwnerModal from "@/features/smart-homes/components/AssignOwnerModal";
import StatusBadge from "@/shared/ui/StatusBadge";
import SeverityBadge from "@/shared/ui/SeverityBadge";
import Timeline from "@/shared/ui/Timeline";
import { useToast } from "@/shared/ui/Toast";
import { logStore, smartHomeStore } from "@/shared/mock/store";
import type { LogCategory } from "@/shared/mock/types";

const HOME_LOG_CATEGORIES: LogCategory[] = ["gateway", "device", "provision", "automation"];

type Tab = "overview" | "rooms" | "devices" | "members" | "automation" | "camera" | "history" | "log";

const TABS: { value: Tab; label: string }[] = [
  { value: "overview", label: "Thông tin" },
  { value: "rooms", label: "Rooms" },
  { value: "devices", label: "Devices" },
  { value: "members", label: "Members" },
  { value: "automation", label: "Automation" },
  { value: "camera", label: "Camera" },
  { value: "history", label: "History" },
  { value: "log", label: "Log" },
];

export default function SmartHomeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { detail, isLoading, refresh } = useSmartHomeDetail(Number(id));
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>("overview");
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-slate-500">
          <RefreshCw className="h-4 w-4 animate-spin" /> Đang tải…
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex min-h-[calc(100vh-5rem)] flex-col items-center justify-center gap-4">
        <p className="text-critical">Không tìm thấy Smart Home.</p>
        <Link href="/smart-homes" className="inline-flex items-center gap-2 rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3.5 py-1.5 text-sm font-medium text-gray-700 dark:text-slate-300 transition hover:bg-gray-50 dark:hover:bg-slate-700">
          <ArrowLeft className="h-4 w-4" /> Trở về Smart Homes
        </Link>
      </div>
    );
  }

  const { home, owner, gateway, rooms, members, timeline, devices, automationRules, cameras } = detail;
  const activeRoomId = selectedRoomId ?? rooms[0]?.id ?? null;
  const activeRoomDevices = activeRoomId ? devices.filter((d) => d.room_id === activeRoomId) : [];
  const homeLogs = HOME_LOG_CATEGORIES
    .flatMap((c) => logStore.listByCategory(c))
    .filter((l) => l.home_id === home.id);

  function handleAssign(customerId: number) {
    smartHomeStore.assignOwner(home.id, customerId);
    refresh();
    showToast(`Đã gán "${home.name}" cho khách hàng.`);
  }

  return (
    <div className="w-full space-y-3">
      <div>
        <Link href="/smart-homes" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200">
          <ArrowLeft className="h-3.5 w-3.5" /> Smart Homes
        </Link>
        <div className="mt-1.5 flex items-center gap-2.5">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">{home.name}</h1>
          <StatusBadge status={home.status} />
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-gray-200 dark:border-slate-700">
        {TABS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`rounded-t px-3 py-2 text-sm font-medium transition
              ${tab === value ? "border-b-2 border-brand text-brand" : "text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && home.status === "unclaimed" && (
        <div className="flex flex-col items-start justify-between gap-3 rounded-md border border-brand/30 bg-brand-soft/40 p-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Nhà này chưa có chủ sở hữu</p>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
              Nếu khách hàng đã đăng ký tài khoản trên Mobile App, Operator có thể tra cứu User ID và gán quyền sở hữu trực tiếp tại đây.
            </p>
          </div>
          <button type="button" onClick={() => setAssignOpen(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded bg-brand px-3.5 py-1.5 text-sm font-semibold text-white transition hover:brightness-90">
            <KeyRound className="h-3.5 w-3.5" /> Gán khách hàng (User ID)
          </button>
        </div>
      )}

      {tab === "overview" && (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500">Thông tin</p>
            <div className="mt-3 space-y-2.5 text-sm">
              <div className="flex items-center gap-2 text-gray-700 dark:text-slate-300">
                <span className="font-medium">Chủ nhà:</span>{" "}
                {owner ? <>{owner.name} <span className="font-mono text-xs text-gray-400 dark:text-slate-500">({owner.user_tag})</span></> : "— (unclaimed)"}
              </div>
              <div className="flex items-center gap-2 text-gray-500 dark:text-slate-400">
                <MapPin size={13} /> {home.address}
              </div>
              <div className="flex items-center gap-2 text-gray-500 dark:text-slate-400">
                <Calendar size={13} /> Kích hoạt: {home.activated_at ? new Date(home.activated_at).toLocaleDateString("vi-VN") : "Chưa kích hoạt"}
              </div>
              <div className="text-gray-500 dark:text-slate-400">Gói: <span className="font-mono">{home.package}</span></div>
            </div>
          </div>

          <div className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500">Gateway</p>
            {gateway ? (
              <div className="mt-3 space-y-2.5 text-sm">
                <div className="flex items-center gap-2">
                  <Server size={14} className="text-gray-400 dark:text-slate-500" />
                  <span className="font-mono text-gray-900 dark:text-slate-100">{gateway.uid}</span>
                  <StatusBadge status={gateway.status} />
                </div>
                <p className="text-gray-500 dark:text-slate-400">Firmware: {gateway.firmware_version} · RSSI: {gateway.rssi}dBm</p>
                <p className="text-gray-500 dark:text-slate-400">
                  Last seen: {gateway.last_seen ? new Date(gateway.last_seen).toLocaleTimeString("vi-VN") : "—"}
                </p>
                <Link href={`/gateways/${gateway.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:brightness-90">
                  Xem chi tiết Gateway →
                </Link>
              </div>
            ) : (
              <p className="mt-3 text-sm text-gray-400 dark:text-slate-500">Chưa gán Gateway.</p>
            )}
          </div>
        </div>
      )}

      {tab === "rooms" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {rooms.map((room) => (
              <RoomCard
                key={room.id}
                room={room}
                deviceCount={devices.filter((d) => d.room_id === room.id).length}
                active={activeRoomId === room.id}
                onClick={() => setSelectedRoomId(room.id)}
              />
            ))}
          </div>

          {activeRoomId && (
            <div className="overflow-hidden rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800">
              <div className="border-b border-gray-100 dark:border-slate-700 bg-[#F4F5F7] dark:bg-slate-900 px-4 py-2.5">
                <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                  {rooms.find((r) => r.id === activeRoomId)?.name}
                </p>
              </div>
              {activeRoomDevices.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-gray-400 dark:text-slate-500">Phòng này chưa có thiết bị.</p>
              ) : (
                <ul className="divide-y divide-gray-100 dark:divide-slate-700">
                  {activeRoomDevices.map((d) => (
                    <li key={d.id} className="flex items-center justify-between px-4 py-2.5">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-slate-100">{d.device_name}</p>
                        <p className="text-xs capitalize text-gray-400 dark:text-slate-500">{d.category}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={d.status} />
                        <Link href={`/devices/${d.id}`} className="inline-flex items-center gap-1 rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-slate-300 transition hover:border-brand hover:bg-brand-soft hover:text-brand">
                          <Eye className="h-3 w-3" /> Chi tiết
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "devices" && (
        <div className="overflow-hidden rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800">
          {devices.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-400 dark:text-slate-500">Nhà này chưa có thiết bị.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full table-auto text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-slate-700 bg-[#F4F5F7] dark:bg-slate-900">
                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Thiết bị</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Room</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Loại</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Trạng thái</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {devices.map((d) => (
                    <tr key={d.id} className="bg-white dark:bg-slate-800 hover:bg-brand-soft/30">
                      <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-slate-100">{d.device_name}</td>
                      <td className="px-4 py-2.5 text-gray-500 dark:text-slate-400">{rooms.find((r) => r.id === d.room_id)?.name ?? "—"}</td>
                      <td className="px-4 py-2.5 capitalize text-gray-500 dark:text-slate-400">{d.category}</td>
                      <td className="px-4 py-2.5"><StatusBadge status={d.status} /></td>
                      <td className="px-4 py-2.5">
                        <Link href={`/devices/${d.id}`} className="text-xs font-semibold text-brand hover:brightness-90">Chi tiết →</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "members" && (
        <div className="overflow-hidden rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800">
          <div className="border-b border-gray-100 dark:border-slate-700 bg-[#F4F5F7] dark:bg-slate-900 px-4 py-2">
            <p className="text-xs text-gray-500 dark:text-slate-400">Chỉ xem — thành viên tự quản lý qua Mobile App.</p>
          </div>
          {members.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-400 dark:text-slate-500">Chưa có thành viên nào.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-slate-700">
              {members.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold uppercase text-white">
                    {m.initials}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-slate-100">{m.name} {m.is_you && <span className="ml-1 text-xs text-gray-400">(Bạn)</span>}</p>
                    <p className="text-xs text-gray-400 dark:text-slate-500">{m.role}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "automation" && (
        <div className="overflow-hidden rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800">
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-700 bg-[#F4F5F7] dark:bg-slate-900 px-4 py-2">
            <p className="text-xs text-gray-500 dark:text-slate-400">Rule tự động hoá của nhà này</p>
            <Link href="/automation" className="text-xs font-semibold text-brand hover:brightness-90">Quản lý Automation →</Link>
          </div>
          {automationRules.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-400 dark:text-slate-500">Chưa có rule nào.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-slate-700">
              {automationRules.map((r) => (
                <li key={r.id} className="flex items-center justify-between px-4 py-2.5">
                  <p className="text-sm font-medium text-gray-900 dark:text-slate-100">{r.name}</p>
                  <StatusBadge status={r.enabled ? "active" : "inactive"} label={r.enabled ? "Bật" : "Tắt"} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "camera" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cameras.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-slate-500">Nhà này chưa có camera.</p>
          ) : (
            cameras.map((c) => (
              <div key={c.id} className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
                <div className="flex h-24 items-center justify-center rounded bg-gray-100 dark:bg-slate-700">
                  <CameraIcon className="h-6 w-6 text-gray-400 dark:text-slate-500" />
                </div>
                <p className="mt-2.5 text-sm font-semibold text-gray-900 dark:text-slate-100">{c.name}</p>
                <StatusBadge status={c.status} />
              </div>
            ))
          )}
        </div>
      )}

      {tab === "history" && (
        <div className="rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <Timeline items={timeline.map((e) => ({ id: e.id, timestamp: e.timestamp, label: e.label, description: e.description }))} />
        </div>
      )}

      {tab === "log" && (
        <div className="overflow-hidden rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800">
          {homeLogs.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-400 dark:text-slate-500">Chưa có log nào cho nhà này.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-slate-700">
              {homeLogs.map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                  <div>
                    <p className="text-sm text-gray-700 dark:text-slate-300">{l.message}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-gray-400 dark:text-slate-500">{new Date(l.timestamp).toLocaleString("vi-VN")}</p>
                  </div>
                  <SeverityBadge severity={l.severity} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <AssignOwnerModal
        open={assignOpen}
        homeName={home.name}
        onClose={() => setAssignOpen(false)}
        onAssign={handleAssign}
      />
    </div>
  );
}
