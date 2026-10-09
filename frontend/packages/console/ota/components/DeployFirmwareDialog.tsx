"use client";

import { useState } from "react";
import { AlertTriangle, RefreshCw, UploadCloud } from "lucide-react";
import ModalShell from "@smarthome/console/components/ModalShell";
import { InlineError } from "@smarthome/console/components/PageStates";
import { useSmartHomes } from "@smarthome/console/smart-homes/hooks/useSmartHomes";
import { usePermissions } from "@smarthome/console/auth/usePermissions";
import { createDeployment } from "@smarthome/console/api/ota.api";
import { errorMessage } from "@smarthome/console/lib/errors";
import { BTN_PRIMARY, BTN_SECONDARY, LABEL, SELECT } from "@smarthome/console/lib/ui";
import type { FirmwareVersion, OtaDeployment } from "@smarthome/console/api/types";

type DeployFirmwareDialogProps = {
  firmware: FirmwareVersion;
  onClose: () => void;
  onDeployed: (deployment: OtaDeployment) => void;
};

// FR-9.4 — chọn phạm vi triển khai: Admin được chọn toàn fleet hoặc một nhà; Operator chỉ
// triển khai theo một nhà (nhà chưa kích hoạt hoặc đang có quyền truy cập). Với bản beta
// (chưa stable) cảnh báo rõ rủi ro. Render có điều kiện để mỗi lần mở là form mới.
export default function DeployFirmwareDialog({ firmware, onClose, onDeployed }: DeployFirmwareDialogProps) {
  const { canDeployFleet } = usePermissions();
  const { homes, isLoading: homesLoading } = useSmartHomes({}, { poll: false });
  const [scope, setScope] = useState<"fleet" | "home">(canDeployFleet ? "fleet" : "home");
  const [homeId, setHomeId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const targetLabel = firmware.type === "gateway" ? "Gateway" : "Node";

  async function handleSubmit() {
    if (scope === "home" && homeId === null) {
      setError("Chọn Smart Home cần cập nhật firmware.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const deployment = await createDeployment({
        firmware_id: firmware.id,
        scope,
        target_home_id: scope === "home" ? homeId ?? undefined : undefined,
      });
      onDeployed(deployment);
      onClose();
    } catch (err) {
      setError(errorMessage(err, {
        NO_TARGETS: scope === "fleet"
          ? `Chưa có ${targetLabel} nào để cập nhật. Tạo Smart Home hoặc đăng ký thiết bị trước.`
          : `Nhà đã chọn chưa có ${targetLabel} nào để cập nhật. Chọn nhà khác.`,
        FORBIDDEN: "Bạn không có quyền triển khai theo phạm vi này. Operator chỉ được cập nhật theo từng Smart Home.",
        ACCESS_GRANT_REQUIRED: "Nhà này đã được khách hàng kích hoạt — cần quyền truy cập có thời hạn. Mở trang Smart Home của nhà và bấm “Yêu cầu quyền truy cập”.",
      }));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell
      open
      onClose={onClose}
      title="Triển khai firmware"
      subtitle={`${targetLabel} firmware v${firmware.version}`}
      icon={UploadCloud}
      busy={submitting}
      onSubmit={handleSubmit}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={submitting} className={BTN_SECONDARY}>Huỷ</button>
          <button type="submit" disabled={submitting} className={BTN_PRIMARY}>
            {submitting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
            Bắt đầu triển khai
          </button>
        </>
      }
    >
      {!firmware.stable && (
        <div className="flex items-start gap-2.5 rounded border border-warning/30 bg-warning-soft px-3 py-2.5 text-sm text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Đây là bản <span className="font-semibold">chưa stable (beta)</span>. Nên thử trên một nhà trước khi triển khai rộng.
          </p>
        </div>
      )}

      <div>
        <span className={LABEL}>Phạm vi</span>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={submitting || !canDeployFleet}
            onClick={() => setScope("fleet")}
            title={canDeployFleet ? undefined : "Chỉ Admin triển khai được toàn bộ fleet"}
            className={`rounded border-2 px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50
              ${scope === "fleet" ? "border-brand bg-brand-soft text-brand" : "border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-400 hover:border-gray-300 dark:hover:border-slate-500"}`}
          >
            Toàn bộ fleet
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => setScope("home")}
            className={`rounded border-2 px-3 py-2 text-sm font-medium transition disabled:opacity-60
              ${scope === "home" ? "border-brand bg-brand-soft text-brand" : "border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-400 hover:border-gray-300 dark:hover:border-slate-500"}`}
          >
            Một Smart Home
          </button>
        </div>
        {!canDeployFleet && (
          <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">Chỉ Admin triển khai được toàn bộ fleet.</p>
        )}
      </div>

      {scope === "home" ? (
        <div>
          <label htmlFor="deploy-home" className={LABEL}>Smart Home</label>
          <select
            id="deploy-home"
            value={homeId ?? ""}
            onChange={(e) => { setHomeId(e.target.value ? Number(e.target.value) : null); setError(""); }}
            className={`${SELECT} w-full`}
            disabled={submitting}
          >
            <option value="">— Chọn Smart Home —</option>
            {homes.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
          {homesLoading && homes.length === 0 && <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">Đang tải danh sách nhà…</p>}
        </div>
      ) : (
        <p className="text-sm text-gray-600 dark:text-slate-300">
          Mọi {targetLabel} đã đăng ký sẽ được cập nhật lên v{firmware.version}. Theo dõi tiến độ ở bảng “Lịch sử triển khai”;
          nếu có lỗi, bấm Rollback để dừng đợt triển khai.
        </p>
      )}

      <InlineError>{error}</InlineError>
    </ModalShell>
  );
}
