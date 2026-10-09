import AuthGuard from "@smarthome/shared/auth/components/AuthGuard";
import { ToastProvider } from "@smarthome/shared/ui/Toast";
import PortalSwrProvider from "@/lib/api/PortalSwrProvider";
import { CurrentHomeProvider } from "@/features/home/providers/CurrentHomeProvider";
import PortalShell from "@/widgets/PortalShell";

export default function PrivateLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <PortalSwrProvider>
        <ToastProvider>
          <CurrentHomeProvider>
            <PortalShell>{children}</PortalShell>
          </CurrentHomeProvider>
        </ToastProvider>
      </PortalSwrProvider>
    </AuthGuard>
  );
}
