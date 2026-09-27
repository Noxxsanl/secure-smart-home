import AuthGuard from "@smarthome/shared/auth/components/AuthGuard";
import { ToastProvider } from "@smarthome/shared/ui/Toast";
import PortalShell from "@/widgets/PortalShell";

export default function PrivateLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <ToastProvider>
        <PortalShell>{children}</PortalShell>
      </ToastProvider>
    </AuthGuard>
  );
}
