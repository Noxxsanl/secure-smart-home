import { redirect } from "next/navigation";
import { AUTH_ROUTES } from "@/features/auth/routes";

export default function Home() {
  redirect(AUTH_ROUTES.login);
}
