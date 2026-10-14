import 'server-only';
import { addDays, datesBetween, jstStartAsUtc } from './dateRange';
import { query } from './db';

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
async function countByDay(def: DailySeriesDef, from: string, to: string, dates: string[]): Promise<number[]> {
  const { rows } = await query<{ d: string; n: number }>(
    `SELECT DATE_FORMAT(DATE_ADD(${def.column}, INTERVAL 9 HOUR), '%Y-%m-%d') AS d, COUNT(*) AS n
     FROM ${def.table}
     WHERE ${def.column} >= :start AND ${def.column} < :end ${def.extraWhere}
     GROUP BY d`,
    { start: jstStartAsUtc(from), end: jstStartAsUtc(addDays(to, 1)) },
  );
  const map = new Map(rows.map((r) => [r.d, Number(r.n)]));
  return dates.map((d) => map.get(d) ?? 0);
}

export async function dailyCounts(from: string, to: string) {
  const dates = datesBetween(from, to);
  const values = await Promise.all(DAILY_SERIES.map((def) => countByDay(def, from, to, dates)));
  return {
    dates,
    series: DAILY_SERIES.map((def, i) => ({
      key: def.key,
      label: def.label,
      shortLabel: def.shortLabel,
      color: def.color,
      values: values[i],
    })),
  };
}
