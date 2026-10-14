/** 期間指定 (日本時間の YYYY-MM-DD) の共通処理。ダッシュボード・コンバージョン（誘導）で使う */
const DAY = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const toYmd = (d: Date) => d.toISOString().slice(0, 10);
export const parseYmd = (s: string) => new Date(`${s}T00:00:00Z`);

export function todayJst(): string {
  return toYmd(new Date(Date.now() + 9 * 3600_000));
}
export function addDays(ymd: string, days: number): string {
  return toYmd(new Date(parseYmd(ymd).getTime() + days * DAY));
}
export function addMonths(ymd: string, months: number): string {
  const d = parseYmd(ymd);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return toYmd(target);
}
/** 日本時間のその日の 0:00 を、DB に入っている UTC の日時文字列にする */
export function jstStartAsUtc(ymd: string): string {
  return new Date(parseYmd(ymd).getTime() - 9 * 3600_000).toISOString().slice(0, 19).replace('T', ' ');
}

const MAX_DAYS = 366;

export type DateRange = { from: string; to: string; error?: string };

/**
 * 期間: 指定が無い・不正なら初期値 (今月 = 当月 1 日〜今日 / 直近 1 か月)
 */
export function resolveRange(
  sp: { from?: string; to?: string },
  defaultRange: 'thisMonth' | 'lastMonth' = 'lastMonth',
): DateRange {
  const today = todayJst();
  const fallback =
    defaultRange === 'thisMonth'
      ? { from: `${today.slice(0, 8)}01`, to: today }
      : { from: addDays(addMonths(today, -1), 1), to: today };
  const name = defaultRange === 'thisMonth' ? '今月' : '直近 1 か月';
  if (!sp.from && !sp.to) return fallback;
  if (!sp.from || !sp.to || !DATE_RE.test(sp.from) || !DATE_RE.test(sp.to)) {
    return { ...fallback, error: `日付の形式が正しくないため、${name}を表示しています` };
  }
  const days = (parseYmd(sp.to).getTime() - parseYmd(sp.from).getTime()) / DAY + 1;
  if (Number.isNaN(days)) return { ...fallback, error: `日付の形式が正しくないため、${name}を表示しています` };
  if (days < 1) return { ...fallback, error: `開始日が終了日より後になっているため、${name}を表示しています` };
  if (days > MAX_DAYS) return { ...fallback, error: `期間は ${MAX_DAYS} 日以内で指定してください（${name}を表示しています）` };
  return { from: sp.from, to: sp.to };
}

/** 期間内の日付の一覧 */
export function datesBetween(from: string, to: string): string[] {
  const n = (parseYmd(to).getTime() - parseYmd(from).getTime()) / DAY + 1;
  return Array.from({ length: n }, (_, i) => addDays(from, i));
}

/** よく使う期間のボタン */
export function rangePresets() {
  const today = todayJst();
  return [
    { label: '今月', from: `${today.slice(0, 8)}01`, to: today },
    { label: '直近 7 日', from: addDays(today, -6), to: today },
    { label: '直近 1 か月', from: addDays(addMonths(today, -1), 1), to: today },
    { label: '直近 3 か月', from: addDays(addMonths(today, -3), 1), to: today },
    { label: '直近 1 年', from: addDays(addMonths(today, -12), 1), to: today },
  ];
}

/** 今月 1 日 (日本時間の YYYY-MM-DD) */
export function monthStartJst(): string {
  return `${todayJst().slice(0, 8)}01`;
}
