import Sidebar from "@/widgets/app-shell/Sidebar";
import Header from "@/widgets/app-shell/Header";
import { DevicesProvider } from "@/features/devices/providers/DevicesProvider";
import { AddDeviceProvider } from "@/features/devices/providers/AddDeviceProvider";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DevicesProvider>
      <AddDeviceProvider>
        <div className="bg-[#F6F8FB] dark:bg-slate-900 text-gray-900 dark:text-slate-100">
          <Sidebar />
          <div className="ml-60 flex h-screen flex-col overflow-hidden">
            <Header />
            <main className="flex-1 overflow-y-auto bg-[#F6F8FB] dark:bg-slate-900 px-5 py-4 sm:px-6 lg:px-7">
              {children}
            </main>
          </div>
        </div>
      </AddDeviceProvider>
    </DevicesProvider>
  );
}
