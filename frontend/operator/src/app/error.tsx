"use client";

import ErrorView from "@smarthome/shared/app-shell/ErrorView";
import { PORTAL } from "@/config/portal";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorView error={error} reset={reset} homeHref={PORTAL.homePath} />;
}
