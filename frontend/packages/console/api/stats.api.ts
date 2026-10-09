import { dashPath } from "@smarthome/console/api/client";

// §5 Stats — badge sidebar + dashboard từng role.

export function badgesKey() {
  return dashPath("/stats/badges");
}

export function operatorStatsKey() {
  return dashPath("/stats/operator");
}

export function adminStatsKey() {
  return dashPath("/stats/admin");
}
