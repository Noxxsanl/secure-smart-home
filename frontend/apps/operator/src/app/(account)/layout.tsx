import { GuestGuard } from "@shh/auth";

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <GuestGuard>{children}</GuestGuard>;
}
