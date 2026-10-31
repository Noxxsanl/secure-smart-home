import { AuthGuard } from "@shh/auth";
import { ToastProvider } from "@shh/ui";
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
