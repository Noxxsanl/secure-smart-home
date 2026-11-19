// Response GET /api/dashboard/stats/badges (CONTRACT §5 Stats).

export interface ConsoleBadges {
  unclaimed_homes: number;
  offline_gateways: number;
  ota_in_progress: number;
  unread_notifications: number;
}
