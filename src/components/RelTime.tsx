import { formatJst, parseDbDate } from '@/lib/format';

/**
 * 一覧の日時を「3 分前」「今日 14:20」「昨日 14:20」のように表示する (それより前は日付と時刻)。
 * マウスを乗せると正確な日時を出す。表示した時点 (サーバーで画面を作った時点) を基準にする。
 */
export function RelTime({ value, empty = '—' }: { value: unknown; empty?: string }) {
  const d = parseDbDate(value);
  if (!d) return <>{empty}</>;
  const full = formatJst(value);
  return (
    <time dateTime={d.toISOString()} title={full}>
      {relativeJst(d, full)}
    </time>
  );
}

function relativeJst(d: Date, full: string): string {
  const now = Date.now();
  const diffMin = Math.floor((now - d.getTime()) / 60_000);
  if (diffMin >= 0 && diffMin < 1) return 'たった今';
  if (diffMin >= 0 && diffMin < 60) return `${diffMin} 分前`;
  // 日本時間の日付で「今日」「昨日」を判定する
  const ymd = (t: number) => new Date(t + 9 * 3600_000).toISOString().slice(0, 10);
  const time = full.slice(-5); // HH:MM
  if (ymd(d.getTime()) === ymd(now)) return `今日 ${time}`;
  if (ymd(d.getTime()) === ymd(now - 86_400_000)) return `昨日 ${time}`;
  return full;
}
