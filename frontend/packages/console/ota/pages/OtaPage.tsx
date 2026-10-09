"use client";

import { useState } from "react";
import Link from "next/link";
import { UploadCloud, RotateCcw, Plus, Star, StarOff, History, RefreshCw } from "lucide-react";
import { useOta } from "@smarthome/console/ota/hooks/useOta";
import UploadFirmwareModal from "@smarthome/console/ota/components/UploadFirmwareModal";
import DeployFirmwareDialog from "@smarthome/console/ota/components/DeployFirmwareDialog";
import ConfirmModal from "@smarthome/console/components/ConfirmModal";
import Panel, { PanelEmpty } from "@smarthome/console/components/Panel";
import { LoadErrorBar } from "@smarthome/console/components/PageStates";
import { usePermissions } from "@smarthome/console/auth/usePermissions";
import StatusBadge from "@smarthome/shared/ui/StatusBadge";
import ProgressBar from "@smarthome/shared/ui/ProgressBar";
import { useToast } from "@smarthome/shared/ui/Toast";
import { revalidateOtaData, rollbackDeployment, setFirmwareStable } from "@smarthome/console/api/ota.api";
import { errorMessage } from "@smarthome/console/lib/errors";
import { formatDateTime, formatRelative, formatSizeKb } from "@smarthome/console/lib/format";
import { OTA_STATUS_LABELS } from "@smarthome/console/lib/labels";
import {
  BTN_PRIMARY, BTN_SM, BTN_SM_BRAND, BTN_SM_DANGER, MUTED_DASH, SEGMENTED, TABLE_HEAD_ROW, TH, TR, segmentButton,
} from "@smarthome/console/lib/ui";
import type {
  FirmwareType, FirmwareVersion, OtaDeployment, OtaDeploymentStatus,
} from "@smarthome/console/api/types";

const BADGE_STATUS: Record<OtaDeploymentStatus, string> = {
  in_progress: "in_progress",
  completed: "completed",
  rolled_back: "rolled_back",
  failed: "blocked",
};

const PROGRESS_COLOR: Record<OtaDeploymentStatus, string> = {
  in_progress: "bg-brand",
  completed: "bg-success",
  rolled_back: "bg-critical",
  failed: "bg-warning",
};

const TYPE_LABELS: Record<FirmwareType, string> = { gateway: "Gateway Firmware", node: "Node Firmware" };

function byNewest<T>(getTime: (item: T) => string) {
  return (a: T, b: T) => new Date(getTime(b)).getTime() - new Date(getTime(a)).getTime();
}

// Rollback áp dụng cho đợt đang chạy hoặc đã lỗi một phần (đợt hoàn tất/đã rollback thì không còn gì để dừng).
function canRollback(d: OtaDeployment): boolean {
  return d.status === "in_progress" || d.status === "failed";
}

export default function OtaPage() {
  const { firmware, deployments, hasInProgress, isLoading, error, refresh } = useOta();
  const { canUploadFirmware, canMarkStable } = usePermissions();
  const { showToast } = useToast();
  const [type, setType] = useState<FirmwareType>("gateway");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deployTarget, setDeployTarget] = useState<FirmwareVersion | null>(null);
  const [rollbackTarget, setRollbackTarget] = useState<OtaDeployment | null>(null);
  const [stableBusyId, setStableBusyId] = useState<number | null>(null);

  const versions = firmware.filter((f) => f.type === type).sort(byNewest((f) => f.released_at));
  const history = deployments.filter((d) => d.firmware_type === type).sort(byNewest((d) => d.started_at));
  const inProgressCount = deployments.filter((d) => d.status === "in_progress").length;

  async function handleToggleStable(fw: FirmwareVersion) {
    if (stableBusyId !== null) return;
    setStableBusyId(fw.id);
    try {
      await setFirmwareStable(fw.id, !fw.stable);
      await revalidateOtaData();
      showToast(fw.stable ? `Đã bỏ đánh dấu stable của v${fw.version}.` : `Đã đánh dấu v${fw.version} là stable.`);
    } catch (err) {
      showToast(errorMessage(err), false);
    } finally {
      setStableBusyId(null);
    }
  }

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">OTA & Firmware</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">
            Tải firmware lên kho → Deploy tới một nhà hoặc cả fleet → theo dõi tiến độ.
            {inProgressCount > 0 && (
              <span className="ml-1 inline-flex items-center gap-1 font-medium text-warning">
                <RefreshCw className="h-3 w-3 animate-spin" /> {inProgressCount} đợt đang chạy — tự cập nhật mỗi 5 giây.
              </span>
            )}
          </p>
        </div>
        {canUploadFirmware && (
          <button type="button" onClick={() => setUploadOpen(true)} className={BTN_PRIMARY}>
            <Plus className="h-3.5 w-3.5" /> Upload Firmware
          </button>
        )}
      </div>

      <div className={`${SEGMENTED} w-fit`}>
        {(["gateway", "node"] as FirmwareType[]).map((t) => (
          <button key={t} type="button" onClick={() => setType(t)} className={segmentButton(type === t)}>
            {TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {!!error && <LoadErrorBar error={error} onRetry={() => void refresh()} />}

      <Panel title="Phiên bản firmware" subtitle={`${TYPE_LABELS[type]} đã lưu trong kho.`}>
        {isLoading && versions.length === 0 ? (
          <PanelEmpty>Đang tải…</PanelEmpty>
        ) : versions.length === 0 ? (
          <PanelEmpty>
            Chưa có phiên bản {type === "gateway" ? "Gateway" : "Node"} nào.
            {canUploadFirmware ? " Bấm “Upload Firmware” để tải bản đầu tiên." : " Nhờ Admin tải firmware lên."}
          </PanelEmpty>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto text-left text-sm">
              <thead>
                <tr className={TABLE_HEAD_ROW}>
                  <th className={TH}>Phiên bản</th>
                  <th className={TH}>Ổn định</th>
                  <th className={TH}>Phát hành</th>
                  <th className={TH}>Ghi chú</th>
                  <th className={TH}>Triển khai gần nhất</th>
                  <th className={TH}>Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {versions.map((fw) => {
                  const latest = deployments
                    .filter((d) => d.firmware_id === fw.id)
                    .sort(byNewest((d) => d.started_at))[0];
                  return (
                    <tr key={fw.id} className={TR}>
                      <td className="px-4 py-3">
                        <p className="font-mono text-sm font-semibold text-gray-900 dark:text-slate-100">v{fw.version}</p>
                        <p className="mt-0.5 text-xs text-gray-400 dark:text-slate-500">{fw.file_name} · {formatSizeKb(fw.size_kb)}</p>
                        <p className="font-mono text-[11px] text-gray-300 dark:text-slate-600" title={`SHA-256: ${fw.checksum_sha256}`}>
                          sha256 {fw.checksum_sha256.slice(0, 12)}…
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        {fw.stable ? <StatusBadge status="active" label="Stable" /> : <StatusBadge status="pending" label="Beta" />}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 dark:text-slate-400">
                        {formatDateTime(fw.released_at)}
                        {fw.uploaded_by_username && <p className="text-gray-400 dark:text-slate-500">bởi {fw.uploaded_by_username}</p>}
                      </td>
                      <td className="max-w-64 px-4 py-3 text-xs text-gray-500 dark:text-slate-400">
                        {fw.release_notes
                          ? <span className="line-clamp-2" title={fw.release_notes}>{fw.release_notes}</span>
                          : <span className={MUTED_DASH}>—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {latest ? (
                          <div className="flex items-center gap-2">
                            <div className="w-24"><ProgressBar percent={latest.progress_percent} colorClassName={PROGRESS_COLOR[latest.status]} /></div>
                            <span className="font-mono text-xs text-gray-400 dark:text-slate-500">{latest.progress_percent}%</span>
                            <StatusBadge status={BADGE_STATUS[latest.status]} label={OTA_STATUS_LABELS[latest.status]} />
                          </div>
                        ) : <span className="text-xs text-gray-400 dark:text-slate-500">Chưa triển khai</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button type="button" onClick={() => setDeployTarget(fw)} className={BTN_SM_BRAND}>
                            <UploadCloud className="h-3 w-3" /> Deploy
                          </button>
                          {canMarkStable && (
                            <button
                              type="button"
                              disabled={stableBusyId !== null}
                              onClick={() => void handleToggleStable(fw)}
                              className={BTN_SM}
                              title={fw.stable ? "Bỏ đánh dấu bản ổn định" : "Đánh dấu là bản ổn định"}
                            >
                              {fw.stable ? <StarOff className="h-3 w-3" /> : <Star className="h-3 w-3" />}
                              {fw.stable ? "Bỏ stable" : "Đánh dấu stable"}
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
      </Panel>

      <Panel
        title={<span className="inline-flex items-center gap-1.5"><History className="h-3.5 w-3.5 text-gray-400 dark:text-slate-500" /> Lịch sử triển khai</span>}
        subtitle={hasInProgress ? "Đang có đợt triển khai chạy — tiến độ do thiết bị báo về." : `Các đợt triển khai ${TYPE_LABELS[type]}.`}
      >
        {history.length === 0 ? (
          <PanelEmpty>Chưa có đợt triển khai {type === "gateway" ? "Gateway" : "Node"} nào.</PanelEmpty>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto text-left text-sm">
              <thead>
                <tr className={TABLE_HEAD_ROW}>
                  <th className={TH}>Firmware</th>
                  <th className={TH}>Phạm vi</th>
                  <th className={TH}>Tiến độ</th>
                  <th className={TH}>Thiết bị</th>
                  <th className={TH}>Trạng thái</th>
                  <th className={TH}>Bắt đầu</th>
                  <th className={TH}>Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {history.map((d) => (
                  <tr key={d.id} className={TR}>
                    <td className="px-4 py-3 font-mono text-sm font-semibold text-gray-900 dark:text-slate-100">v{d.firmware_version}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-slate-300">
                      {d.scope === "fleet"
                        ? "Toàn bộ fleet"
                        : d.target_home_id && d.target_home_name
                          ? <Link href={`/smart-homes/${d.target_home_id}`} className="text-brand hover:brightness-90">{d.target_home_name}</Link>
                          : "Một Smart Home"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-28"><ProgressBar percent={d.progress_percent} colorClassName={PROGRESS_COLOR[d.status]} /></div>
                        <span className="font-mono text-xs text-gray-400 dark:text-slate-500">{d.progress_percent}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-slate-400">
                      <span className="font-semibold text-success">{d.applied_count}</span>/{d.target_count} xong
                      {d.failed_count > 0 && <span className="ml-1 font-semibold text-critical">· {d.failed_count} lỗi</span>}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={BADGE_STATUS[d.status]} label={OTA_STATUS_LABELS[d.status]} /></td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-slate-400">
                      <span title={formatDateTime(d.started_at)}>{formatRelative(d.started_at)}</span>
                      {d.created_by_username && <p className="text-gray-400 dark:text-slate-500">bởi {d.created_by_username}</p>}
                    </td>
                    <td className="px-4 py-3">
                      {canRollback(d) ? (
                        <button type="button" onClick={() => setRollbackTarget(d)} className={BTN_SM_DANGER}>
                          <RotateCcw className="h-3 w-3" /> Rollback
                        </button>
                      ) : <span className={MUTED_DASH}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {uploadOpen && (
        <UploadFirmwareModal
          defaultType={type}
          onClose={() => setUploadOpen(false)}
          onUploaded={(fw) => {
            void revalidateOtaData();
            setType(fw.type);
            showToast(`Đã lưu firmware v${fw.version} vào kho. Bấm “Deploy” để bắt đầu cập nhật.`);
          }}
        />
      )}

      {deployTarget && (
        <DeployFirmwareDialog
          firmware={deployTarget}
          onClose={() => setDeployTarget(null)}
          onDeployed={(d) => {
            void revalidateOtaData();
            showToast(`Đã bắt đầu triển khai v${d.firmware_version} cho ${d.target_count} thiết bị.`);
          }}
        />
      )}

      {rollbackTarget && (
        <ConfirmModal
          title="Rollback đợt triển khai"
          subtitle={`v${rollbackTarget.firmware_version}`}
          icon={RotateCcw}
          danger
          description="Rollback dừng đợt triển khai này: các thiết bị chưa cập nhật sẽ được huỷ. Thiết bị đã cập nhật xong không bị đổi lại phiên bản."
          confirmLabel="Rollback"
          onConfirm={async () => {
            await rollbackDeployment(rollbackTarget.id);
            await revalidateOtaData();
            showToast("Đã rollback đợt triển khai.");
          }}
          onClose={() => setRollbackTarget(null)}
          errorOverrides={{
            ACCESS_GRANT_REQUIRED: "Nhà này đã được khách hàng kích hoạt — cần quyền truy cập có thời hạn. Mở trang Smart Home của nhà và bấm “Yêu cầu quyền truy cập”.",
          }}
        />
      )}
    </div>
  );
}
