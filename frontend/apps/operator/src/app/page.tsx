import { redirect } from "next/navigation";
import { PORTAL } from "@/config/portal";

// Chưa đăng nhập thì AuthGuard của trang chủ sẽ chuyển tiếp về /login.
export default function Home() {
  redirect(PORTAL.homePath);
}
