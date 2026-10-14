import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/guard';
import { query } from '@/lib/db';
import { DailyCharts, DailySeries } from './DailyCharts';
import { DateRangeFilter } from './DateRangeFilter';
import { addDays, datesBetween, jstStartAsUtc, rangePresets, resolveRange } from '@/lib/dateRange';

export const metadata: Metadata = { title: 'ダッシュボード' };

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

/* グラフの色 (色覚の多様性に配慮したパレット: 青・橙・青緑・黄・桃) */
const COLORS = {
  contacts: '#2a78d6',
  newsletter: '#eb6834',
  presents: '#1baf7a',
  applications: '#eda100',
  clicks: '#e87ba4',
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string; from?: string; to?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const range = resolveRange(sp);
  const dates = datesBetween(range.from, range.to);

  const [{ rows: c }, { rows: a }, { rows: n }, { rows: p }, contacts, applications, clicks, newsletter, presents] =
    await Promise.all([
    query<{ pending: number; in_progress: number }>(
      `SELECT SUM(status = 'pending') AS pending, SUM(status = 'in_progress') AS in_progress
       FROM contacts WHERE deleted_at IS NULL`,
    ),
    query<{ pending: number }>(
      "SELECT SUM(status = 'pending') AS pending FROM service_applications WHERE deleted_at IS NULL",
    ),
    query<{ active: number }>(
      "SELECT COUNT(*) AS active FROM newsletter_subscribers WHERE status = 'active' AND deleted_at IS NULL",
    ),
    query<{ campaign_key: string; total: number }>(
      `SELECT campaign_key, COUNT(*) AS total FROM present_applications
       GROUP BY campaign_key ORDER BY campaign_key DESC LIMIT 1`,
    ),
    dailyCounts('contacts', 'created_at', 'AND deleted_at IS NULL', range.from, range.to, dates),
    dailyCounts('service_applications', 'created_at', 'AND deleted_at IS NULL', range.from, range.to, dates),
    dailyCounts('outbound_clicks', 'created_at', '', range.from, range.to, dates),
    dailyCounts('newsletter_subscribers', 'subscribed_at', 'AND deleted_at IS NULL', range.from, range.to, dates),
    dailyCounts('present_applications', 'created_at', '', range.from, range.to, dates),
  ]);

  const cards = [
    { title: '未対応のお問い合わせ', value: Number(c[0]?.pending ?? 0), href: '/contacts?status=pending' },
    { title: '対応中のお問い合わせ', value: Number(c[0]?.in_progress ?? 0), href: '/contacts?status=in_progress' },
    { title: '未対応の申し込み', value: Number(a[0]?.pending ?? 0), href: '/applications?status=pending' },
    {
      title: '誘導（期間内）',
      value: clicks.reduce((sum, v) => sum + v, 0),
      href: `/clicks?from=${range.from}&to=${range.to}`,
    },
    { title: 'メルマガ登録中', value: Number(n[0]?.active ?? 0), href: '/newsletter?status=active' },
    {
      title: p[0] ? `プレゼント応募（${p[0].campaign_key}）` : 'プレゼント応募',
      value: Number(p[0]?.total ?? 0),
      href: p[0] ? `/presents?campaign=${encodeURIComponent(p[0].campaign_key)}` : '/presents',
    },
  ];

  const series: DailySeries[] = [
    { key: 'contacts', label: 'お問い合わせ', color: COLORS.contacts, values: contacts },
    { key: 'applications', label: 'コンバージョン（申し込み）', color: COLORS.applications, values: applications },
    { key: 'clicks', label: 'コンバージョン（誘導）', color: COLORS.clicks, values: clicks },
    { key: 'newsletter', label: 'メルマガ登録', color: COLORS.newsletter, values: newsletter },
    { key: 'presents', label: 'プレゼント応募', color: COLORS.presents, values: presents },
  ];

  const presets = rangePresets();

  return (
    <>
      <h1 className="page-title">ダッシュボード</h1>
      {sp.denied && <p className="error mb-4">この画面を見る権限がありません。</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
