import AuthGuard from "@smarthome/shared/auth/components/AuthGuard";
import { ToastProvider } from "@smarthome/shared/ui/Toast";
import { CurrentHomeProvider } from "@/features/home/providers/CurrentHomeProvider";
import PortalShell from "@/widgets/PortalShell";

export default function PrivateLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <ToastProvider>
        <CurrentHomeProvider>
          <PortalShell>{children}</PortalShell>
        </CurrentHomeProvider>
      </ToastProvider>
    </AuthGuard>
  );
}
