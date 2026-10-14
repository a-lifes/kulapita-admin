import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/guard';
import { query } from '@/lib/db';
import { DailyCharts, DailySeries } from './DailyCharts';
import { DateRangeFilter } from './DateRangeFilter';

/* ── 日付 (日本時間の YYYY-MM-DD) ── */
const DAY = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const toYmd = (d: Date) => d.toISOString().slice(0, 10);
const parseYmd = (s: string) => new Date(`${s}T00:00:00Z`);
function todayJst(): string {
  return toYmd(new Date(Date.now() + 9 * 3600_000));
}
function addDays(ymd: string, days: number): string {
  return toYmd(new Date(parseYmd(ymd).getTime() + days * DAY));
}
function addMonths(ymd: string, months: number): string {
  const d = parseYmd(ymd);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return toYmd(target);
}
/** 日本時間のその日の 0:00 を、DB に入っている UTC の日時文字列にする */
function jstStartAsUtc(ymd: string): string {
  return new Date(parseYmd(ymd).getTime() - 9 * 3600_000).toISOString().slice(0, 19).replace('T', ' ');
}

const MAX_DAYS = 366;

/** 期間: 指定が無い・不正なら「直近 1 か月 (今日まで)」 */
function resolveRange(sp: { from?: string; to?: string }) {
  const today = todayJst();
  const fallback = { from: addDays(addMonths(today, -1), 1), to: today, error: undefined as string | undefined };
  if (!sp.from && !sp.to) return fallback;
  if (!sp.from || !sp.to || !DATE_RE.test(sp.from) || !DATE_RE.test(sp.to)) {
    return { ...fallback, error: '日付の形式が正しくないため、直近 1 か月を表示しています' };
  }
  const days = (parseYmd(sp.to).getTime() - parseYmd(sp.from).getTime()) / DAY + 1;
  if (days < 1) return { ...fallback, error: '開始日が終了日より後になっているため、直近 1 か月を表示しています' };
  if (days > MAX_DAYS) return { ...fallback, error: `期間は ${MAX_DAYS} 日以内で指定してください（直近 1 か月を表示しています）` };
  return { from: sp.from, to: sp.to, error: undefined };
}

/** 日ごとの件数 (日本時間で集計)。件数の無い日は 0 で埋める */
async function dailyCounts(table: string, column: string, extraWhere: string, from: string, to: string, dates: string[]) {
  const { rows } = await query<{ d: string; n: number }>(
    `SELECT DATE_FORMAT(DATE_ADD(${column}, INTERVAL 9 HOUR), '%Y-%m-%d') AS d, COUNT(*) AS n
     FROM ${table}
     WHERE ${column} >= :start AND ${column} < :end ${extraWhere}
     GROUP BY d`,
    { start: jstStartAsUtc(from), end: jstStartAsUtc(addDays(to, 1)) },
  );
  const map = new Map(rows.map((r) => [r.d, Number(r.n)]));
  return dates.map((d) => map.get(d) ?? 0);
}

/* グラフの色 (色覚の多様性に配慮して検証済みの 3 色: 青・橙・青緑) */
const COLORS = { contacts: '#2a78d6', newsletter: '#eb6834', presents: '#1baf7a' };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string; from?: string; to?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const range = resolveRange(sp);
  const dayCount = (parseYmd(range.to).getTime() - parseYmd(range.from).getTime()) / DAY + 1;
  const dates = Array.from({ length: dayCount }, (_, i) => addDays(range.from, i));

  const [{ rows: c }, { rows: n }, { rows: p }, contacts, newsletter, presents] = await Promise.all([
    query<{ pending: number; in_progress: number }>(
      `SELECT SUM(status = 'pending') AS pending, SUM(status = 'in_progress') AS in_progress
       FROM contacts WHERE deleted_at IS NULL`,
    ),
    query<{ active: number }>(
      "SELECT COUNT(*) AS active FROM newsletter_subscribers WHERE status = 'active' AND deleted_at IS NULL",
    ),
    query<{ campaign_key: string; total: number }>(
      `SELECT campaign_key, COUNT(*) AS total FROM present_applications
       GROUP BY campaign_key ORDER BY campaign_key DESC LIMIT 1`,
    ),
    dailyCounts('contacts', 'created_at', 'AND deleted_at IS NULL', range.from, range.to, dates),
    dailyCounts('newsletter_subscribers', 'subscribed_at', 'AND deleted_at IS NULL', range.from, range.to, dates),
    dailyCounts('present_applications', 'created_at', '', range.from, range.to, dates),
  ]);

  const cards = [
    { title: '未対応のお問い合わせ', value: Number(c[0]?.pending ?? 0), href: '/contacts?status=pending' },
    { title: '対応中のお問い合わせ', value: Number(c[0]?.in_progress ?? 0), href: '/contacts?status=in_progress' },
    { title: 'メルマガ登録中', value: Number(n[0]?.active ?? 0), href: '/newsletter?status=active' },
    {
      title: p[0] ? `プレゼント応募（${p[0].campaign_key}）` : 'プレゼント応募',
      value: Number(p[0]?.total ?? 0),
      href: p[0] ? `/presents?campaign=${encodeURIComponent(p[0].campaign_key)}` : '/presents',
    },
  ];

  const series: DailySeries[] = [
    { key: 'contacts', label: 'お問い合わせ', color: COLORS.contacts, values: contacts },
    { key: 'newsletter', label: 'メルマガ登録', color: COLORS.newsletter, values: newsletter },
    { key: 'presents', label: 'プレゼント応募', color: COLORS.presents, values: presents },
  ];

  const today = todayJst();
  const presets = [
    { label: '直近 7 日', from: addDays(today, -6), to: today },
    { label: '直近 1 か月', from: addDays(addMonths(today, -1), 1), to: today },
    { label: '直近 3 か月', from: addDays(addMonths(today, -3), 1), to: today },
    { label: '直近 1 年', from: addDays(addMonths(today, -12), 1), to: today },
  ];

  return (
    <>
      <h1 className="page-title">ダッシュボード</h1>
      {sp.denied && <p className="error mb-4">この画面を見る権限がありません。</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Link key={card.title} href={card.href} className="card hover:border-brand">
            <p className="text-sm text-slate-600">{card.title}</p>
            <p className="mt-2 text-3xl font-bold">{card.value.toLocaleString()}</p>
          </Link>
        ))}
      </div>

      <section className="card mt-6">
        <h2 className="mb-4 font-bold">日ごとの件数</h2>
        <DateRangeFilter from={range.from} to={range.to} presets={presets} />
        {range.error && <p className="error mt-3">{range.error}</p>}
        <div className="mt-6">
          <DailyCharts dates={dates} series={series} />
        </div>
      </section>
    </>
  );
}
