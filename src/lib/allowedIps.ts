import { cidrContains } from './cidr';
import { query } from './db';

/**
 * 管理画面に入れる IP (CIDR) の一覧。
 * 本当の門番は WAF (ALB の手前) で、ここはアプリ側の二重チェック用。
 * 毎回 DB を見ると遅いので 30 秒だけ覚えておく (変更が反映されるまで最大 30 秒かかる)。
 *
 * ※ proxy からも読み込むため、このファイルでは 'server-only' を使わない。
 */
const TTL_MS = 30_000;
let cache: { at: number; cidrs: string[] } | null = null;

export async function getActiveCidrs(options: { fresh?: boolean } = {}): Promise<string[]> {
  if (!options.fresh && cache && Date.now() - cache.at < TTL_MS) return cache.cidrs;
  const { rows } = await query<{ cidr: string }>(
    'SELECT cidr FROM admin_allowed_ips WHERE deleted_at IS NULL ORDER BY cidr',
  );
  cache = { at: Date.now(), cidrs: rows.map((r) => r.cidr) };
  return cache.cidrs;
}

export function clearAllowedIpCache(): void {
  cache = null;
}

export async function isIpAllowed(ip: string): Promise<boolean> {
  const cidrs = await getActiveCidrs();
  return cidrs.some((c) => cidrContains(c, ip));
}
