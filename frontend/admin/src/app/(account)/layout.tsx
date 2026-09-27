import GuestGuard from "@smarthome/shared/auth/components/GuestGuard";

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <GuestGuard>{children}</GuestGuard>;
}
