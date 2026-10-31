"use client";

import { ACTIVATION_STATUS_LABELS } from "@shh/api-client/dashboard";
import { useState } from "react";
import { Ban, KeyRound, QrCode as QrCodeIcon } from "lucide-react";
import { Panel, ConfirmModal, StatusBadge, useToast, BTN_BRAND_SOFT, BTN_DANGER_SOFT, BTN_PRIMARY } from "@shh/ui";
import AssignOwnerModal from "../../ui/AssignOwnerModal";
import { useAssignOwner, type AssignOwnerOptions } from "../../api/useAssignOwner";
import ActivationCodeDialog from "../../ui/ActivationCodeDialog";
import { issueActivationCode, revokeActivationCode } from "../../api/smartHomes.api";
import { formatDateTime, formatRemaining, useNow } from "@shh/utils";
import type { ActivationCodeIssued, ActivationStatus, HomeActivationInfo, SmartHomeDetailHome } from "@shh/api-client/dashboard";

type HomeActivationPanelProps = {
  home: SmartHomeDetailHome;
  activation: HomeActivationInfo;
  /** Gọi sau mỗi thay đổi (tạo/thu hồi mã, gán chủ nhà) để tải lại trang chi tiết. */
  onChanged: () => void;
};

// Màu badge theo trạng thái mã (tái dùng các kiểu của StatusBadge).
const BADGE_STATUS: Record<ActivationStatus, string> = {
  unused: "active",
  used: "completed",
  revoked: "blocked",
  expired: "pending",
  none: "inactive",
};

const ALREADY_CLAIMED_HINT =
  "Nhà này vừa được kích hoạt (khách tự quét mã hoặc đã được gán). Tải lại trang để xem chủ nhà hiện tại.";

// Nhà chưa kích hoạt: trạng thái Activation Code + thao tác của Operator/Admin
// (FR-2.4 → 2.6, FR-3.x). Plaintext mã chỉ có trong response tạo mã nên ở đây
// chỉ hiện trạng thái; "Tạo mã mới" mở hộp thoại in-một-lần.
export default function HomeActivationPanel({ home, activation, onChanged }: HomeActivationPanelProps) {
  const { showToast } = useToast();
  const now = useNow();
  const [dialog, setDialog] = useState<"new" | "revoke" | "assign" | null>(null);
  const [issued, setIssued] = useState<ActivationCodeIssued | null>(null);

  const remaining = activation.status === "unused" && activation.expires_at
    ? formatRemaining(activation.expires_at, now)
    : null;

  return (
    <>
      <Panel
        title="Mã kích hoạt"
        subtitle="Khách hàng quét QR hoặc nhập mã trong ứng dụng để trở thành chủ nhà."
      >
        <div className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <StatusBadge status={BADGE_STATUS[activation.status]} label={ACTIVATION_STATUS_LABELS[activation.status]} />
            {activation.expires_at && (
              <span className="text-gray-500 dark:text-slate-400">
                Hạn dùng: <span className="font-medium text-gray-700 dark:text-slate-300">{formatDateTime(activation.expires_at)}</span>
                {remaining && <> · còn {remaining}</>}
              </span>
            )}
            {activation.created_at && (
              <span className="text-xs text-gray-400 dark:text-slate-500">Tạo lúc {formatDateTime(activation.created_at)}</span>
            )}
          </div>

          <p className="text-xs text-gray-400 dark:text-slate-500">
            Vì lý do bảo mật, mã chỉ hiện đúng một lần lúc tạo — hệ thống chỉ lưu bản băm. Nếu mất tem, tạo mã mới
            (mã chưa dùng cũ tự bị thu hồi). Nếu khách đã có tài khoản, có thể gán trực tiếp bằng User ID.
          </p>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setDialog("new")} className={BTN_PRIMARY}>
              <QrCodeIcon className="h-3.5 w-3.5" /> Tạo mã mới
            </button>
            {activation.status === "unused" && (
              <button type="button" onClick={() => setDialog("revoke")} className={BTN_DANGER_SOFT}>
                <Ban className="h-3.5 w-3.5" /> Thu hồi mã
              </button>
            )}
            <button type="button" onClick={() => setDialog("assign")} className={BTN_BRAND_SOFT}>
              <KeyRound className="h-3.5 w-3.5" /> Gán khách hàng (User ID)
            </button>
          </div>
        </div>
      </Panel>

      {dialog === "new" && (
        <ConfirmModal
          title="Tạo mã kích hoạt mới"
          subtitle={home.name}
          icon={QrCodeIcon}
          description="Mã chưa dùng hiện tại (nếu có) sẽ bị thu hồi ngay. Mã mới chỉ hiện một lần — hãy sẵn sàng in tem trước khi tiếp tục."
          confirmLabel="Tạo mã mới"
          onConfirm={async () => {
            const code = await issueActivationCode(home.id);
            setIssued(code);
            onChanged();
          }}
          onClose={() => setDialog(null)}
          errorOverrides={{ ALREADY_CLAIMED: ALREADY_CLAIMED_HINT }}
        />
      )}

      {dialog === "revoke" && (
        <ConfirmModal
          title="Thu hồi mã kích hoạt"
          subtitle={home.name}
          icon={Ban}
          danger
          description="Mã đang dùng được sẽ vô hiệu ngay: khách quét tem này sẽ nhận thông báo mã đã hết hạn. Bạn có thể tạo mã mới sau."
          confirmLabel="Thu hồi"
          onConfirm={async () => {
            await revokeActivationCode(home.id);
            onChanged();
            showToast("Đã thu hồi mã kích hoạt.");
          }}
          onClose={() => setDialog(null)}
          errorOverrides={{ ALREADY_CLAIMED: ALREADY_CLAIMED_HINT }}
        />
      )}

      {dialog === "assign" && (
        <AssignOwnerDialog
          homeId={home.id}
          homeName={home.name}
          initialQuery={home.expected_owner_name ?? ""}
          onClose={() => setDialog(null)}
          onAssigned={(customer) => {
            onChanged();
            showToast(`Đã gán "${home.name}" cho ${customer.name}.`);
          }}
        />
      )}

      {issued && (
        <ActivationCodeDialog
          activation={issued}
          homeName={home.name}
          packageCode={home.package}
          onClose={() => setIssued(null)}
        />
      )}
    </>
  );
}

// Hộp thoại gán chủ = hook (api/useAssignOwner) + view (ui/AssignOwnerModal).
function AssignOwnerDialog({ homeName, ...options }: AssignOwnerOptions & { homeName: string }) {
  const state = useAssignOwner(options);
  return <AssignOwnerModal homeName={homeName} state={state} onClose={options.onClose} />;
}
