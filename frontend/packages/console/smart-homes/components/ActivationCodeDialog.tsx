"use client";

import { QrCode as QrCodeIcon } from "lucide-react";
import ModalShell from "@smarthome/console/components/ModalShell";
import ActivationCodePanel from "@smarthome/console/smart-homes/components/ActivationCodePanel";
import { useBeforeUnload } from "@smarthome/console/lib/hooks";
import { BTN_PRIMARY } from "@smarthome/console/lib/ui";
import type { ActivationCodeIssued, PackageCode } from "@smarthome/console/api/types";

type ActivationCodeDialogProps = {
  activation: ActivationCodeIssued;
  homeName: string;
  packageCode: PackageCode;
  onClose: () => void;
};

const CLOSE_WARNING = "Đóng hộp thoại sẽ không xem lại được mã này (chỉ có thể tạo mã mới). Bạn đã in tem chưa?";

// Hiện mã vừa tạo lại (POST /smart-homes/:id/activation-codes) — một lần duy nhất,
// kèm QR + in tem. Chặn đóng tab trong lúc hộp thoại mở; đóng bằng Esc/nút X thì hỏi lại.
export default function ActivationCodeDialog({ activation, homeName, packageCode, onClose }: ActivationCodeDialogProps) {
  useBeforeUnload(true);

  return (
    <ModalShell
      open
      onClose={() => { if (window.confirm(CLOSE_WARNING)) onClose(); }}
      title="Mã kích hoạt mới"
      subtitle={homeName}
      icon={QrCodeIcon}
      footer={<button type="button" onClick={onClose} className={BTN_PRIMARY}>Đã in tem — đóng</button>}
    >
      <ActivationCodePanel activation={activation} homeName={homeName} packageCode={packageCode} />
    </ModalShell>
  );
}
