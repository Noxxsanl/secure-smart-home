import ShellFrame from "@/widgets/app-shell/ShellFrame";
import RoleGuard from "@/widgets/app-shell/RoleGuard";
import { ToastProvider } from "@/shared/ui/Toast";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard>
      <ToastProvider>
        <ShellFrame>{children}</ShellFrame>
      </ToastProvider>
    </RoleGuard>
  );
}
