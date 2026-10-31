"use client";

import { CATEGORY_LABELS, useHomeOptions } from "@shh/api-client/dashboard";
import { useState } from "react";
import Link from "next/link";
import { Cpu, Lock, Unlock, Power, Trash2, RefreshCw, Eye, Search, FlaskConical } from "lucide-react";
import { useDeviceList } from "../../api/useDeviceList";
import { usePermissions } from "@shh/auth";
import {
  OnlineIndicator, ConfirmModal, LoadErrorBar, StatusBadge, EmptyState, useToast, BTN_SM, BTN_SM_DANGER, BTN_SM_SUCCESS, BTN_SM_WARNING, CARD, COUNT_PILL, MUTED_DASH, SEARCH_INPUT, SEGMENTED, SELECT_SM, TABLE_HEAD_ROW, TH, TOOLBAR, TR, segmentButton,
} from "@shh/ui";
import { deleteDevice, revalidateDeviceData, updateDeviceStatus } from "../../api/devices.api";
import { useDebouncedValue, formatRelative } from "@shh/utils";
import { CATEGORY_ICONS } from "../../ui/categoryIcons";
import type { ConsoleDevice, DeviceCategory, DeviceStatus } from "@shh/api-client/dashboard";

type CategoryFilter = "all" | DeviceCategory;
type PendingAction = { type: "delete" | "lock" | "unlock" | "activate"; device: ConsoleDevice };

const NODE_CATEGORIES: DeviceCategory[] = ["sensor", "relay", "camera", "door_contact"];

const STATUS_OPTIONS: { value: DeviceStatus | "all"; label: string }[] = [
  { value: "all", label: "Mọi trạng thái" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "blocked", label: "Blocked" },
];

const ACTION_COPY: Record<PendingAction["type"], { title: string; confirm: string; danger: boolean }> = {
  delete: { title: "Xoá thiết bị", confirm: "Xoá", danger: true },
  lock: { title: "Khoá thiết bị", confirm: "Khoá", danger: true },
  unlock: { title: "Mở khoá thiết bị", confirm: "Mở khoá", danger: false },
  activate: { title: "Kích hoạt thiết bị", confirm: "Kích hoạt", danger: false },
};

function describeAction(action: PendingAction): string {
  const name = `“${action.device.device_name}”`;
  switch (action.type) {
    case "delete": return `Xoá vĩnh viễn ${name}? Thiết bị phải đăng ký lại nếu muốn dùng tiếp. Hành động không hoàn tác được.`;
    case "lock": return `Khoá ${name}? Dữ liệu và lệnh từ thiết bị này sẽ bị từ chối cho tới khi mở khoá.`;
    case "unlock": return `Mở khoá ${name}? Bộ đếm lỗi xác thực của thiết bị sẽ được đặt lại.`;
    case "activate": return `Kích hoạt ${name}? Thiết bị sẽ được phép gửi dữ liệu.`;
  }
}

export default function DevicesPage() {
  const { canUpdateDeviceStatus, canDeleteDevice } = usePermissions();
  const { showToast } = useToast();
  const { homes } = useHomeOptions();

  const [category, setCategory] = useState<CategoryFilter>("all");
  const [status, setStatus] = useState<DeviceStatus | "all">("all");
  const [homeId, setHomeId] = useState<number | null>(null);
  const [includeGateways, setIncludeGateways] = useState(false);
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<PendingAction | null>(null);

  const q = useDebouncedValue(search, 300);
  // Bộ lọc nhà/trạng thái/từ khoá/Gateway chạy ở server. Loại thiết bị lọc ở client
  // (danh sách không phân trang) để các chip luôn hiện đúng số lượng của từng loại.
  const { devices, isLoading, isValidating, error, refresh } = useDeviceList({
    home_id: homeId,
    status: status === "all" ? null : status,
    q,
    include_gateways: includeGateways,
  });

  const categories: DeviceCategory[] = includeGateways ? ["gateway", ...NODE_CATEGORIES] : NODE_CATEGORIES;
  const counts = devices.reduce<Record<string, number>>((acc, d) => {
    acc[d.category] = (acc[d.category] ?? 0) + 1;
    return acc;
  }, {});
  const effectiveCategory: CategoryFilter = category !== "all" && !categories.includes(category) ? "all" : category;
  const tableDevices = effectiveCategory === "all" ? devices : devices.filter((d) => d.category === effectiveCategory);
  const hasFilter = effectiveCategory !== "all" || status !== "all" || homeId !== null || !!q;

  async function runAction(action: PendingAction) {
    const { type, device } = action;
    if (type === "delete") {
      await deleteDevice(device.id);
    } else {
      await updateDeviceStatus(device.id, type === "lock" ? "blocked" : "active");
    }
    await revalidateDeviceData();
    showToast(
      type === "delete" ? `Đã xoá “${device.device_name}”.`
        : type === "lock" ? `Đã khoá “${device.device_name}”.`
        : type === "unlock" ? `Đã mở khoá “${device.device_name}”.`
        : `Đã kích hoạt “${device.device_name}”.`
    );
  }

  return (
    <div className="w-full space-y-3">
      <div>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Devices</h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">
          Danh sách thiết bị toàn hệ thống — mỗi thiết bị thuộc một phòng của một Smart Home. Thiết bị phần cứng chưa gán nhà hiện “Chưa gán nhà”.
        </p>
      </div>

      <div className={`overflow-hidden ${CARD}`}>
        <div className={TOOLBAR}>
          <div className={`${SEGMENTED} flex-wrap`}>
            <button type="button" onClick={() => setCategory("all")} className={segmentButton(effectiveCategory === "all")}>
              Tất cả <span className={COUNT_PILL}>{devices.length}</span>
            </button>
            {categories.map((cat) => {
              const Icon = CATEGORY_ICONS[cat];
              return (
                <button key={cat} type="button" onClick={() => setCategory(cat)} className={segmentButton(effectiveCategory === cat)}>
                  <Icon className="h-3 w-3" />
                  {CATEGORY_LABELS[cat]}
                  <span className={COUNT_PILL}>{counts[cat] ?? 0}</span>
                </button>
              );
            })}
          </div>

          <div className="relative min-w-48 max-w-72 flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Tìm tên hoặc mã thiết bị…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={SEARCH_INPUT}
            />
          </div>

          <select
            aria-label="Lọc theo Smart Home"
            value={homeId ?? ""}
            onChange={(e) => setHomeId(e.target.value ? Number(e.target.value) : null)}
            className={SELECT_SM}
          >
            <option value="">Mọi Smart Home</option>
            {homes.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>

          <select
            aria-label="Lọc theo trạng thái"
            value={status}
            onChange={(e) => setStatus(e.target.value as DeviceStatus | "all")}
            className={SELECT_SM}
          >
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-slate-400">
            <input
              type="checkbox"
              checked={includeGateways}
              onChange={(e) => setIncludeGateways(e.target.checked)}
              className="h-3.5 w-3.5 cursor-pointer rounded accent-brand"
            />
            Hiện cả Gateway
          </label>

          <div className="ml-auto flex items-center gap-2 text-xs text-gray-400 dark:text-slate-500">
            {isLoading || (isValidating && devices.length === 0)
              ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Đang tải…</>
              : <span><span className="font-semibold text-gray-700 dark:text-slate-300">{tableDevices.length}</span> thiết bị</span>}
          </div>
        </div>

        {!!error && <LoadErrorBar error={error} onRetry={() => void refresh()} />}

        {!isLoading && tableDevices.length === 0 ? (
          <EmptyState
            icon={Cpu}
            title={hasFilter ? "Không tìm thấy thiết bị phù hợp" : "Chưa có thiết bị nào"}
            description={hasFilter ? "Thử đổi bộ lọc hoặc từ khoá." : "Thiết bị xuất hiện ở đây sau khi tạo Smart Home hoặc đăng ký phần cứng."}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto text-left text-sm">
              <thead>
                <tr className={TABLE_HEAD_ROW}>
                  <th className={TH}>Thiết bị</th>
                  <th className={TH}>Smart Home</th>
                  <th className={TH}>Phòng</th>
                  <th className={TH}>Loại</th>
                  <th className={TH}>Trạng thái</th>
                  <th className={TH}>Kết nối</th>
                  <th className={TH}>Hoạt động</th>
                  <th className={TH}>Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {tableDevices.map((device) => {
                  const Icon = CATEGORY_ICONS[device.category];
                  const detailHref = device.category === "gateway" ? `/gateways/${device.id}` : `/devices/${device.id}`;
                  return (
                    <tr key={device.id} className={TR}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900 dark:text-slate-100">{device.device_name}</p>
                        <p className="mt-0.5 flex items-center gap-1.5 font-mono text-xs text-gray-400 dark:text-slate-500">
                          {device.device_uid}
                          {device.is_simulated && (
                            <span title="Thiết bị giả lập do backend điều khiển" className="inline-flex items-center gap-0.5 rounded bg-gray-100 dark:bg-slate-700 px-1 py-0.5 font-sans text-[10px] font-semibold text-gray-500 dark:text-slate-400">
                              <FlaskConical size={9} /> Mô phỏng
                            </span>
                          )}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {device.home_id && device.home_name ? (
                          <Link href={`/smart-homes/${device.home_id}`} className="text-brand hover:brightness-90">{device.home_name}</Link>
                        ) : <span className="text-gray-400 dark:text-slate-500">Chưa gán nhà</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400">{device.room_name ?? <span className={MUTED_DASH}>—</span>}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1.5"><Icon size={13} />{CATEGORY_LABELS[device.category]}</span>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={device.status} /></td>
                      <td className="px-4 py-3"><OnlineIndicator online={device.online} /></td>
                      <td className="px-4 py-3 text-sm text-gray-400 dark:text-slate-500">{formatRelative(device.last_seen)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Link href={detailHref} className={BTN_SM}>
                            <Eye className="h-3 w-3" /> Chi tiết
                          </Link>

                          {canUpdateDeviceStatus && (
                            device.status === "inactive" ? (
                              <button type="button" onClick={() => setPending({ type: "activate", device })} className={BTN_SM_SUCCESS}>
                                <Power className="h-3 w-3" /> Kích hoạt
                              </button>
                            ) : device.status === "blocked" ? (
                              <button type="button" onClick={() => setPending({ type: "unlock", device })} className={BTN_SM_SUCCESS}>
                                <Unlock className="h-3 w-3" /> Mở khoá
                              </button>
                            ) : (
                              <button type="button" onClick={() => setPending({ type: "lock", device })} className={BTN_SM_WARNING}>
                                <Lock className="h-3 w-3" /> Khoá
                              </button>
                            )
                          )}

                          {canDeleteDevice && (
                            <button type="button" onClick={() => setPending({ type: "delete", device })} className={BTN_SM_DANGER}>
                              <Trash2 className="h-3 w-3" /> Xoá
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pending && (
        <ConfirmModal
          title={ACTION_COPY[pending.type].title}
          subtitle={pending.device.device_uid}
          danger={ACTION_COPY[pending.type].danger}
          description={describeAction(pending)}
          confirmLabel={ACTION_COPY[pending.type].confirm}
          onConfirm={() => runAction(pending)}
          onClose={() => setPending(null)}
          errorOverrides={{
            ACCESS_GRANT_REQUIRED: "Thiết bị thuộc nhà đã được khách hàng kích hoạt — cần quyền truy cập có thời hạn. Mở trang Smart Home của nhà và bấm “Yêu cầu quyền truy cập”.",
          }}
        />
      )}
    </div>
  );
}
