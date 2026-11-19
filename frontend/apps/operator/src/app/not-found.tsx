import { NotFoundView } from "@shh/ui";
import { PORTAL } from "@/config/portal";

export default function NotFoundPage() {
  return <NotFoundView homeHref={PORTAL.homePath} />;
}
