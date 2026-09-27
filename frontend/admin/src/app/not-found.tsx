import NotFoundView from "@smarthome/shared/app-shell/NotFoundView";
import { PORTAL } from "@/config/portal";

export default function NotFoundPage() {
  return <NotFoundView homeHref={PORTAL.homePath} />;
}
