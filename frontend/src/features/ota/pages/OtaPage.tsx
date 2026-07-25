"use client";

import { useEffect, useState } from "react";
import { UploadCloud, RotateCcw, History, Plus } from "lucide-react";
import { useOta } from "@/features/ota/hooks/useOta";
import UploadFirmwareModal from "@/features/ota/components/UploadFirmwareModal";
import StatusBadge from "@/shared/ui/StatusBadge";
import ProgressBar from "@/shared/ui/ProgressBar";
import ConfirmDialog from "@/shared/ui/ConfirmDialog";
import { useToast } from "@/shared/ui/Toast";
import { firmwareStore, gatewayStore, deviceStore } from "@/shared/mock/store";
import type { FirmwareType } from "@/shared/mock/types";

export default function OtaPage() {
  const { rows, isLoading, refresh } = useOta();
  const { showToast } = useToast();
  const [type, setType] = useState<FirmwareType>("gateway");
  const [rollbackTarget, setRollbackTarget] = useState<number | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const filteredRows = rows.filter((r) => r.firmware.type === type);
  const hasInProgress = rows.some((r) => r.deployment?.status === "in_progress");

  // Simulates devices reporting flash progress back while a rollout is running —
  // mirrors the real OTA loop: gateway/node polls, downloads the .bin, reboots,
  // reports success. Ticks every 1.5s until every in_progress deployment completes.
  useEffect(() => {
    if (!hasInProgress) return;
    const id = setInterval(() => {
      if (firmwareStore.advanceInProgress()) refresh();
    }, 1500);
    return () => clearInterval(id);
  }, [hasInProgress, refresh]);

  function handleUpload(input: { type: FirmwareType; version: string; stable: boolean; fileName: string; sizeKb: number }) {
    firmwareStore.upload(input);
    refresh();
    showToast(`Đã lưu firmware ${input.version} vào hệ thống. Bấm "Deploy" để bắt đầu cập nhật.`);
  }

  function handleDeploy(firmwareId: number) {
    const targetCount = type === "gateway" ? gatewayStore.list().length : deviceStore.list().length;
    firmwareStore.deploy(firmwareId, "fleet", null, targetCount);
    refresh();
    showToast("Đã bắt đầu rollout firmware tới toàn bộ fleet.");
  }

  function handleRollbackConfirm() {
    if (rollbackTarget === null) return;
    firmwareStore.rollback(rollbackTarget);
    refresh();
    showToast("Đã rollback firmware về phiên bản trước.");
    setRollbackTarget(null);
  }

  return (
    <div className="w-full space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">OTA & Firmware</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">Upload firmware mới → lưu vào hệ thống → Deploy để cập nhật fleet.</p>
        </div>
        <button type="button" onClick={() => setUploadOpen(true)}
          className="inline-flex items-center gap-1.5 rounded bg-brand px-3.5 py-1.5 text-sm font-semibold text-white transition hover:brightness-90">
          <Plus className="h-3.5 w-3.5" /> Upload Firmware
        </button>
      </div>

      <div className="flex items-center rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-0.5 gap-0.5 w-fit">
        {(["gateway", "node"] as FirmwareType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`rounded px-3 py-1.5 text-xs font-semibold capitalize transition ${type === t ? "bg-brand-soft text-brand" : "text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"}`}
          >
            {t === "gateway" ? "Gateway Firmware" : "Node Firmware"}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-md border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="overflow-x-auto">
          <table className="min-w-full table-auto text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-slate-700 bg-[#F4F5F7] dark:bg-slate-900">
                <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Version</th>
                <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Stable</th>
                <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Deploy đến</th>
                <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Tiến trình</th>
                <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {!isLoading && filteredRows.map(({ firmware, deployment }) => (
                <tr key={firmware.id} className="bg-white dark:bg-slate-800">
                  <td className="px-4 py-3">
                    <p className="font-mono text-sm font-semibold text-gray-900 dark:text-slate-100">{firmware.version}</p>
                    <p className="mt-0.5 text-xs text-gray-400 dark:text-slate-500">{firmware.file_name} · {firmware.size_kb} KB</p>
                  </td>
                  <td className="px-4 py-3">{firmware.stable ? <StatusBadge status="active" label="Stable" /> : <StatusBadge status="pending" label="Beta" />}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400">
                    {deployment ? `${deployment.target_count} ${type}` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {deployment ? (
                      <div className="flex items-center gap-2">
                        <div className="w-28"><ProgressBar percent={deployment.progress_percent}
                          colorClassName={deployment.status === "rolled_back" ? "bg-critical" : "bg-brand"} /></div>
                        <span className="font-mono text-xs text-gray-400 dark:text-slate-500">{deployment.progress_percent}%</span>
                        <StatusBadge status={deployment.status} />
                      </div>
                    ) : <span className="text-gray-300 dark:text-slate-600">— chưa deploy</span>}
                  </td>
                  <td className="px-4 py-3">
                    {deployment ? (
                      deployment.status === "in_progress" ? (
                        <button type="button" onClick={() => setRollbackTarget(deployment.id)}
                          className="inline-flex items-center gap-1 rounded border border-critical/20 bg-critical-soft px-2.5 py-1 text-xs font-medium text-critical transition hover:brightness-95">
                          <RotateCcw className="h-3 w-3" /> Rollback
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-400 dark:text-slate-500">
                          <History className="h-3 w-3" /> History
                        </span>
                      )
                    ) : (
                      <button type="button" onClick={() => handleDeploy(firmware.id)}
                        className="inline-flex items-center gap-1 rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-slate-300 transition hover:border-brand hover:bg-brand-soft hover:text-brand">
                        <UploadCloud className="h-3 w-3" /> Deploy
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <UploadFirmwareModal
        open={uploadOpen}
        defaultType={type}
        onClose={() => setUploadOpen(false)}
        onUpload={handleUpload}
      />

      <ConfirmDialog
        open={rollbackTarget !== null}
        title="Rollback firmware"
        description="Rollback sẽ dừng rollout hiện tại và khôi phục phiên bản firmware trước đó cho các thiết bị đã cập nhật."
        confirmLabel="Rollback"
        danger
        onConfirm={handleRollbackConfirm}
        onCancel={() => setRollbackTarget(null)}
      />
    </div>
  );
}
