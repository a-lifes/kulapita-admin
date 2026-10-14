import 'server-only';
import { dayInfo } from './calendar';
import { addDays, datesBetween, jstStartAsUtc } from './dateRange';
import { query } from './db';
import { Ga4NotConfiguredError, SiteKey, SITES, topPageViews } from './ga4';

/** 日ごとの件数 (ダッシュボードのグラフ・表・CSV で共通) */
export type DailySeriesDef = {
  key: string;
  label: string;
  /** 表・CSV の見出し用の短い名前 */
  shortLabel: string;
  color: string;
  table: string;
  column: string;
  extraWhere: string;
};

/* 色は色覚の多様性に配慮したパレット (青・黄・桃・橙・青緑) */
export const DAILY_SERIES: DailySeriesDef[] = [
  { key: 'contacts', label: 'お問い合わせ', shortLabel: 'お問い合わせ', color: '#2a78d6', table: 'contacts', column: 'created_at', extraWhere: 'AND deleted_at IS NULL' },
  { key: 'applications', label: 'コンバージョン（申し込み）', shortLabel: '申し込み', color: '#eda100', table: 'service_applications', column: 'created_at', extraWhere: 'AND deleted_at IS NULL' },
  { key: 'clicks', label: 'コンバージョン（誘導）', shortLabel: '誘導', color: '#e87ba4', table: 'outbound_clicks', column: 'created_at', extraWhere: '' },
  { key: 'newsletter', label: 'メルマガ登録', shortLabel: 'メルマガ登録', color: '#eb6834', table: 'newsletter_subscribers', column: 'subscribed_at', extraWhere: 'AND deleted_at IS NULL' },
  { key: 'presents', label: 'プレゼント応募', shortLabel: 'プレゼント応募', color: '#1baf7a', table: 'present_applications', column: 'created_at', extraWhere: '' },
];

/** 1 系列の日ごとの件数 (日本時間で集計)。件数の無い日は 0 で埋める */
async function countByDay(
  def: DailySeriesDef,
  from: string,
  to: string,
  dates: string[],
  extraParams: Record<string, string> = {},
): Promise<number[]> {
  const { rows } = await query<{ d: string; n: number }>(
    `SELECT DATE_FORMAT(DATE_ADD(${def.column}, INTERVAL 9 HOUR), '%Y-%m-%d') AS d, COUNT(*) AS n
     FROM ${def.table}
     WHERE ${def.column} >= :start AND ${def.column} < :end ${def.extraWhere}
     GROUP BY d`,
    { start: jstStartAsUtc(from), end: jstStartAsUtc(addDays(to, 1)), ...extraParams },
  );
  const map = new Map(rows.map((r) => [r.d, Number(r.n)]));
  return dates.map((d) => map.get(d) ?? 0);
}

/** トップページの PV (GA4) の系列 */
export const PV_SERIES = { key: 'pv', label: 'トップページ PV', shortLabel: 'トップページ PV', color: '#7c5cd6' };

async function pageViews(site: SiteKey, from: string, to: string, dates: string[]) {
  try {
    const map = await topPageViews(site, from, to);
    return { values: dates.map((d) => map.get(d) ?? 0) };
  } catch (e) {
    if (!(e instanceof Ga4NotConfiguredError)) console.error('[ga4]', e instanceof Error ? e.message : e);
    return { values: dates.map(() => 0), error: e instanceof Error ? e.message : 'GA4 から取得できませんでした' };
  }
}

/** サイトへのログイン回数の系列 (選んでいるサイトのホスト名で数える) */
export const LOGIN_SERIES = { key: 'logins', label: 'ログイン数', shortLabel: 'ログイン数', color: '#0e7490' };

async function logins(site: SiteKey, from: string, to: string, dates: string[]) {
  const hosts = SITES[site].hosts;
  const params = Object.fromEntries(hosts.map((h, i) => [`host${i}`, h]));
  const def: DailySeriesDef = {
    ...LOGIN_SERIES,
    table: 'member_logins',
    column: 'created_at',
    extraWhere: `AND site_host IN (${hosts.map((_, i) => `:host${i}`).join(', ')})`,
  };
  try {
    return { values: await countByDay(def, from, to, dates, params) };
  } catch (e) {
    console.error('[dashboard] ログイン数を取得できませんでした', e instanceof Error ? e.message : e);
    return { values: dates.map(() => 0), error: 'ログインの記録を読めませんでした（マイグレーション 0006 が未実行の可能性があります）' };
  }
}

export async function dailyCounts(from: string, to: string, site: SiteKey) {
  const dates = datesBetween(from, to);
  const [pv, login, ...values] = await Promise.all([
    pageViews(site, from, to, dates),
    logins(site, from, to, dates),
    ...DAILY_SERIES.map((def) => countByDay(def, from, to, dates)),
  ]);
  return {
    dates,
    days: dates.map(dayInfo),
    series: [
      { ...PV_SERIES, values: pv.values, error: pv.error as string | undefined },
      { ...LOGIN_SERIES, values: login.values, error: login.error as string | undefined },
      ...DAILY_SERIES.map((def, i) => ({
        key: def.key,
        label: def.label,
        shortLabel: def.shortLabel,
        color: def.color,
        values: values[i],
        error: undefined as string | undefined,
      })),
    ],
  };
}
