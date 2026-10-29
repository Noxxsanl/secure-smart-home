// Số liệu tổng hợp cho badge và dashboard. "Gateway của đội thiết bị" = gateway đã provision (gateway
// chưa bao giờ kết nối của nhà mới tạo không bị tính là "mất kết nối").
import { queryOne, toCount } from "../../../lib/db";
import { ONLINE_WINDOW_SECONDS } from "../../../lib/time";

const ONLINE_SQL = `last_seen IS NOT NULL AND last_seen > NOW() - make_interval(secs => ${ONLINE_WINDOW_SECONDS})`;

async function count(sql: string): Promise<number> {
  const row = await queryOne<{ total: unknown }>(sql);
  return toCount(row?.total);
}

export const countUnclaimedHomes = () => count("SELECT COUNT(*) AS total FROM smart_homes WHERE status = 'unclaimed'");

export async function homeStatusCounts(): Promise<{ unclaimed: number; active: number; suspended: number; total: number }> {
  const row = await queryOne<{ unclaimed: unknown; active: unknown; suspended: unknown; total: unknown }>(
    `SELECT COUNT(*) FILTER (WHERE status = 'unclaimed') AS unclaimed,
            COUNT(*) FILTER (WHERE status = 'active') AS active,
            COUNT(*) FILTER (WHERE status = 'suspended') AS suspended,
            COUNT(*) AS total
       FROM smart_homes`
  );
  return {
    unclaimed: toCount(row?.unclaimed),
    active: toCount(row?.active),
    suspended: toCount(row?.suspended),
    total: toCount(row?.total),
  };
}

export const countCustomers = () => count("SELECT COUNT(*) AS total FROM customers");

export async function gatewayCounts(): Promise<{ online: number; total: number }> {
  const row = await queryOne<{ online: unknown; total: unknown }>(
    `SELECT COUNT(*) FILTER (WHERE ${ONLINE_SQL}) AS online, COUNT(*) AS total
       FROM devices WHERE device_type = 'gateway' AND provision_status = 'provisioned'`
  );
  return { online: toCount(row?.online), total: toCount(row?.total) };
}

export async function deviceCounts(): Promise<{ online: number; total: number }> {
  const row = await queryOne<{ online: unknown; total: unknown }>(
    `SELECT COUNT(*) FILTER (WHERE ${ONLINE_SQL}) AS online, COUNT(*) AS total
       FROM devices WHERE device_type <> 'gateway' AND provision_status = 'provisioned'`
  );
  return { online: toCount(row?.online), total: toCount(row?.total) };
}
