import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/guard';
import { query } from '@/lib/db';
import { DailyView } from './DailyCharts';
import { dailyCounts } from '@/lib/dailyCounts';
import { DateRangeFilter } from './DateRangeFilter';
import { resolveSite, SITES, topPageViews } from '@/lib/ga4';
import { jstStartAsUtc, monthStartJst, rangePresets, resolveRange, todayJst } from '@/lib/dateRange';

export const metadata: Metadata = { title: 'ダッシュボード' };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string; from?: string; to?: string; site?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  // 日ごとの件数の初期表示は「今月」
  const range = resolveRange(sp, 'thisMonth');
  // トップページ PV を出すサイト (初期値は管理画面と同じ環境)
  const site = resolveSite(sp.site);

  // 「今月」のカードは表示している期間に関係なく、当月 1 日 (日本時間) からの件数
  const monthStart = jstStartAsUtc(monthStartJst());

  const [
    { rows: c },
    { rows: a },
    { rows: k },
    { rows: n },
    { rows: p },
    daily,
    monthPv,
  ] = await Promise.all([
    query<{ pending: number; in_progress: number }>(
      `SELECT SUM(status = 'pending') AS pending, SUM(status = 'in_progress') AS in_progress
       FROM contacts WHERE deleted_at IS NULL`,
    ),
    query<{ pending: number }>(
      "SELECT SUM(status = 'pending') AS pending FROM service_applications WHERE deleted_at IS NULL",
    ),
    query<{ total: number }>('SELECT COUNT(*) AS total FROM outbound_clicks WHERE created_at >= :start', {
      start: monthStart,
    }),
    query<{ total: number }>(
      'SELECT COUNT(*) AS total FROM newsletter_subscribers WHERE subscribed_at >= :start AND deleted_at IS NULL',
      { start: monthStart },
    ),
    query<{ campaign_key: string; total: number }>(
      `SELECT campaign_key, COUNT(*) AS total FROM present_applications
       GROUP BY campaign_key ORDER BY campaign_key DESC LIMIT 1`,
    ),
    dailyCounts(range.from, range.to, site),
    // 今月のトップページ PV (GA4。取得できなければ null)
    topPageViews(site, monthStartJst(), todayJst())
      .then((m) => [...m.values()].reduce((sum, v) => sum + v, 0))
      .catch(() => null),
  ]);

  const cards: { title: string; value: number | null; href: string }[] = [
    {
      title: `トップページ PV（今月・${site === 'prod' ? '本番' : site === 'dev' ? '開発' : 'ローカル'}）`,
      value: monthPv,
      href: `/?site=${site}`,
    },
    { title: '未対応のお問い合わせ', value: Number(c[0]?.pending ?? 0), href: '/contacts?status=pending' },
    { title: '対応中のお問い合わせ', value: Number(c[0]?.in_progress ?? 0), href: '/contacts?status=in_progress' },
    { title: '未対応の申し込み', value: Number(a[0]?.pending ?? 0), href: '/applications?status=pending' },
    {
      title: '誘導（今月）',
      value: Number(k[0]?.total ?? 0),
      href: `/clicks?from=${monthStartJst()}&to=${todayJst()}`,
    },
    { title: 'メルマガ登録（今月）', value: Number(n[0]?.total ?? 0), href: '/newsletter' },
    {
      title: p[0] ? `プレゼント応募（${p[0].campaign_key}）` : 'プレゼント応募',
      value: Number(p[0]?.total ?? 0),
      href: p[0] ? `/presents?campaign=${encodeURIComponent(p[0].campaign_key)}` : '/presents',
    },
  ];


  const presets = rangePresets();

  return (
    <>
      <h1 className="page-title">ダッシュボード</h1>
      {sp.denied && <p className="error mb-4">この画面を見る権限がありません。</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Link key={card.title} href={card.href} className="card hover:border-brand">
            <p className="text-sm text-slate-600">{card.title}</p>
            <p className="mt-2 text-3xl font-bold">{card.value === null ? '—' : card.value.toLocaleString()}</p>
          </Link>
        ))}
      </div>

      <section className="card mt-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-bold">日ごとの件数</h2>
          <a className="btn-sub" href={`/api/export/daily?from=${range.from}&to=${range.to}&site=${site}`}>
            CSV ダウンロード
          </a>
        </div>
        <DateRangeFilter from={range.from} to={range.to} presets={presets} keep={{ site }}>
          <div>
            <label className="label" htmlFor="site">PV のサイト</label>
            <select className="input" id="site" name="site" defaultValue={site}>
              {Object.entries(SITES).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
        </DateRangeFilter>
        {range.error && <p className="error mt-3">{range.error}</p>}
        <DailyView days={daily.days} series={daily.series} />
      </section>
    </>
  );
}
