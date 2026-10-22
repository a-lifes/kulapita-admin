'use server';

import { requireAdmin } from '@/lib/auth/guard';
import { resolveRange } from '@/lib/dateRange';
import { Ga4NotConfiguredError, resolveSite, TrafficSourceRow, trafficSources } from '@/lib/ga4';

export type PageSourcesResult = { ok: true; rows: TrafficSourceRow[] } | { ok: false; error: string };

/** 1 ページ分の誘導元の内訳 (ページ毎の表示回数の円グラフ用)。期間・サイトは一覧と同じ条件 */
export async function pageSourcesAction(input: {
  path: string;
  from?: string;
  to?: string;
  site?: string;
}): Promise<PageSourcesResult> {
  await requireAdmin();
  const path = typeof input?.path === 'string' ? input.path : '';
  if (!path.startsWith('/') || path.length > 500) return { ok: false, error: 'ページの指定が不正です' };
  const range = resolveRange({ from: input.from, to: input.to }, 'thisMonth');
  const site = resolveSite(input.site);
  try {
    return { ok: true, rows: await trafficSources(site, range.from, range.to, path) };
  } catch (e) {
    if (!(e instanceof Ga4NotConfiguredError)) console.error('[ga4] ページの誘導元を取得できませんでした', e instanceof Error ? e.message : e);
    return { ok: false, error: e instanceof Error ? e.message : 'GA4 から取得できませんでした' };
  }
}
