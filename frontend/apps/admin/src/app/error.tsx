"use client";

import { ErrorView } from "@shh/ui";
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
