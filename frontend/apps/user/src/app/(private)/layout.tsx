import { AuthGuard, CurrentHomeProvider, PortalSwrProvider } from "@shh/auth";
import { MyInvitations } from "@shh/homes";
import { ToastProvider } from "@shh/ui";
import PortalShell from "@/widgets/PortalShell";

export default function PrivateLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <PortalSwrProvider>
        <ToastProvider>
          {/* Chưa có nhà nào → HomeGate hiện lời mời đang chờ (@shh/homes) trên hướng dẫn thêm nhà. */}
          <CurrentHomeProvider noHomeSlot={<MyInvitations />}>
            <PortalShell>{children}</PortalShell>
          </CurrentHomeProvider>
        </ToastProvider>
      </PortalSwrProvider>
    </AuthGuard>
  );
}
