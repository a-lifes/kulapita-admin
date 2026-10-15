import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/guard';
import { query } from '@/lib/db';
import { CountUp } from '@/components/CountUp';
import { DailyView } from './DailyCharts';
import { dailyCounts } from '@/lib/dailyCounts';
import { DateRangeFilter } from './DateRangeFilter';
import { canChooseSite, resolveSite, SITES, topPageViews } from '@/lib/ga4';
import { addDays, addMonths, jstStartAsUtc, monthStartJst, rangePresets, resolveRange, todayJst } from '@/lib/dateRange';
import { CompareBadge } from './CompareBadge';

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
  // 「今日」のカードは日本時間の今日 0:00 から
  const today = todayJst();
  const yesterday = addDays(today, -1);
  // 前月比は「前月の同じ期間」(前月 1 日〜前月の今日と同じ日) と比べる
  const prevMonthFrom = addMonths(monthStartJst(), -1);
  const prevMonthTo = addMonths(today, -1);
  const prevMonth = { start: jstStartAsUtc(prevMonthFrom), end: jstStartAsUtc(addDays(prevMonthTo, 1)) };
  const hostParams = Object.fromEntries(SITES[site].hosts.map((h, i) => [`host${i}`, h]));
  const hostList = SITES[site].hosts.map((_, i) => `:host${i}`).join(', ');

  const [
    { rows: c },
    { rows: a },
    { rows: k },
    { rows: n },
    { rows: p },
    daily,
    pv,
    logins,
    { rows: kPrev },
    { rows: nPrev },
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
       GROUP BY campaign_key ORDER BY campaign_key DESC LIMIT 2`,
    ),
    dailyCounts(range.from, range.to, site),
    // 今日・昨日のトップページ表示回数 (GA4。取得できなければ null)
    topPageViews(site, yesterday, today)
      .then((m) => ({ today: m.get(today) ?? 0, yesterday: m.get(yesterday) ?? 0 }))
      .catch(() => null),
    // 今日・昨日サイトにログインした回数 (選んでいるサイトのホスト名で数える。テーブルが無いなどで失敗したら null)
    query<{ today: number; yesterday: number }>(
      `SELECT SUM(created_at >= :todayStart) AS today, SUM(created_at < :todayStart) AS yesterday
       FROM member_logins WHERE created_at >= :yesterdayStart AND site_host IN (${hostList})`,
      { todayStart: jstStartAsUtc(today), yesterdayStart: jstStartAsUtc(yesterday), ...hostParams },
    )
      .then(({ rows }) => ({ today: Number(rows[0]?.today ?? 0), yesterday: Number(rows[0]?.yesterday ?? 0) }))
      .catch((e) => {
        console.error('[dashboard] ログイン数を取得できませんでした', e instanceof Error ? e.message : e);
        return null;
      }),
    query<{ total: number }>(
      'SELECT COUNT(*) AS total FROM outbound_clicks WHERE created_at >= :start AND created_at < :end',
      prevMonth,
    ),
    query<{ total: number }>(
      `SELECT COUNT(*) AS total FROM newsletter_subscribers
       WHERE subscribed_at >= :start AND subscribed_at < :end AND deleted_at IS NULL`,
      prevMonth,
    ),
  ]);

  /** compare: 比べる相手の値と、その名前 (昨日比・前月比など) */
  type Card = {
    title: string;
    value: number | null;
    unit: string;
    href?: string;
    compare?: { label: string; base: number | null; note: string };
  };
  const prevMonthNote = `前月の同じ期間（${prevMonthFrom.slice(5).replace('-', '/')}〜${prevMonthTo.slice(5).replace('-', '/')}）`;
  const cards: Card[] = [
    {
      title: 'トップページ表示回数（今日）',
      value: pv?.today ?? null,
      unit: '回',
      compare: { label: '前日比', base: pv?.yesterday ?? null, note: '前日 1 日' },
    },
    {
      title: 'ログイン数（今日）',
      value: logins?.today ?? null,
      unit: '回',
      compare: { label: '前日比', base: logins?.yesterday ?? null, note: '前日 1 日' },
    },
    { title: '未対応のお問い合わせ', value: Number(c[0]?.pending ?? 0), unit: '件', href: '/contacts?status=pending' },
    { title: '対応中のお問い合わせ', value: Number(c[0]?.in_progress ?? 0), unit: '件', href: '/contacts?status=in_progress' },
    { title: '未対応の申し込み', value: Number(a[0]?.pending ?? 0), unit: '件', href: '/applications?status=pending' },
    {
      title: '誘導数（今月）',
      value: Number(k[0]?.total ?? 0),
      unit: '件',
      href: `/clicks?from=${monthStartJst()}&to=${todayJst()}`,
      compare: { label: '前月比', base: Number(kPrev[0]?.total ?? 0), note: prevMonthNote },
    },
    {
      title: 'メルマガ登録（今月）',
      value: Number(n[0]?.total ?? 0),
      unit: '件',
      href: '/newsletter',
      compare: { label: '前月比', base: Number(nPrev[0]?.total ?? 0), note: prevMonthNote },
    },
    {
      title: p[0] ? `プレゼント（${p[0].campaign_key}）` : 'プレゼント',
      value: Number(p[0]?.total ?? 0),
      unit: '件',
      href: p[0] ? `/presents?campaign=${encodeURIComponent(p[0].campaign_key)}` : '/presents',
      compare: p[1]
        ? { label: '前月比', base: Number(p[1].total), note: `前回の開催月（${p[1].campaign_key}）の応募数` }
        : undefined,
    },
  ];


  const presets = rangePresets();

  return (
    <>
      <h1 className="page-title">ダッシュボード</h1>
      {sp.denied && <p className="error mb-4">この画面を見る権限がありません。</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const body = (
            <>
              <p className="text-sm font-semibold text-slate-600">{card.title}</p>
              <div className="mt-1 flex items-center gap-4">
                <p className="leading-tight tabular-nums">
                  <span className="text-[26px] font-bold">
                    {card.value === null ? '—' : <CountUp value={card.value} />}
                  </span>
                  {card.value !== null && <span className="ml-0.5 text-sm text-slate-600">{card.unit}</span>}
                </p>
                {card.compare && card.value !== null && (
                  <CompareBadge value={card.value} base={card.compare.base} label={card.compare.label} note={card.compare.note} />
                )}
              </div>
            </>
          );
          return card.href ? (
            <Link key={card.title} href={card.href} className="card py-4 hover:border-brand">
              {body}
            </Link>
          ) : (
            <div key={card.title} className="card py-4">
              {body}
            </div>
          );
        })}
      </div>

      <DailyView
        days={daily.days}
        series={daily.series}
        header={
          <>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-bold">日ごとの件数</h2>
              <a className="btn-sub" href={`/api/export/daily?from=${range.from}&to=${range.to}&site=${site}`}>
                CSV ダウンロード
              </a>
            </div>
            <DateRangeFilter from={range.from} to={range.to} presets={presets} keep={{ site: canChooseSite() ? site : undefined }}>
              {/* 本番・開発の管理画面は同じ環境のサイトだけを出すので、選択はローカルだけ */}
              {canChooseSite() && (
                <div>
                  <label className="label" htmlFor="site">PV のサイト</label>
                  <select className="input" id="site" name="site" defaultValue={site}>
                    {Object.entries(SITES).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </DateRangeFilter>
            {range.error && <p className="error mt-3">{range.error}</p>}
          </>
        }
      />
    </>
  );
}
