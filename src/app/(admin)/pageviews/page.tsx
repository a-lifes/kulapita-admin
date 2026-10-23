import type { Metadata } from 'next';
import { icons } from '@/components/icons';
import { ActiveFilters } from '@/components/ActiveFilters';
import { PageHelp } from '@/components/PageHelp';
import { Pagination, pageFrom, perPageFrom } from '@/components/Pagination';
import { ClearButton, SearchButton, SearchForm } from '@/components/SearchForm';
import { SortableTh } from '@/components/SortableTh';
import { hasRole } from '@/lib/adminUsers';
import { requireAdmin } from '@/lib/auth/guard';
import { resolveRange } from '@/lib/dateRange';
import { canChooseSite, Ga4NotConfiguredError, isTrafficSourceKey, resolveSite, SITES, TRAFFIC_SOURCES, TrafficSourceRow, trafficSources } from '@/lib/ga4';
import { PageStatRow, PageStats, pageStats } from '@/lib/pageviewStats';
import { PageSourcesButton } from './PageSourcesButton';
import { resolveSort, SortColumn, sortRows } from '@/lib/sort';

export const metadata: Metadata = { title: '集計・分析' };

/** 並べ替えできる列 (画面側で並べ替える) */
const SORT_COLUMNS: Record<string, SortColumn> = {
  views: { sql: '', firstDir: 'desc' },
  users: { sql: '', firstDir: 'desc' },
  path: { sql: '' },
  title: { sql: '' },
};

/**
 * サイトのページ別の表示回数 (GA4)。期間内にアクセスがあったページだけを、多い順に出す。
 * あわせて、ログインポップアップの表示回数・人数 (GA4 のイベント) と、ログイン数・人数 (自前の DB) も出す。
 * 開くたびに GA4 に問い合わせる (同じ条件は 10 分だけ覚えておく)。
 */
/** 表示の切り替え (ダッシュボードの「グラフで見る」「表で見る」と同じ見た目のタブ。URL の ?tab= で覚える) */
const TABS = [
  { key: 'pages', label: 'ページ毎の表示回数', Icon: icons.table },
  { key: 'sources', label: '誘導元毎の表示回数', Icon: icons.clicks },
  { key: 'kpi', label: '主要KPI', Icon: icons.barChart },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export default async function PageViewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const range = resolveRange(sp, 'thisMonth');
  const site = resolveSite(sp.site);
  const q = sp.q?.trim().slice(0, 100) || undefined;
  // 誘導元の分類 (例: line・google・direct。ga4.ts の TRAFFIC_SOURCES)
  const source = isTrafficSourceKey(sp.source) ? sp.source : undefined;
  const page = pageFrom(sp.page);
  const perPage = perPageFrom(sp.per);
  const sort = resolveSort(sp, SORT_COLUMNS, { key: 'views', dir: 'desc' });
  const tab: TabKey = TABS.some((t) => t.key === sp.tab) ? (sp.tab as TabKey) : 'pages';
  const listParams = {
    from: range.from,
    to: range.to,
    site: canChooseSite() ? site : undefined,
    q,
    source,
    per: sp.per,
    tab: tab === 'pages' ? undefined : tab,
  };
  /** タブの切り替え先 (絞込みの条件・並び順は残す。ページ番号は 1 に戻す) */
  const tabHref = (key: TabKey) => {
    const params = new URLSearchParams(
      Object.entries({ ...listParams, sort: sp.sort, dir: sp.dir, tab: key === 'pages' ? undefined : key }).filter(([, v]) => v) as [
        string,
        string,
      ][],
    );
    const qs = params.toString();
    return qs ? `/pageviews?${qs}` : '/pageviews';
  };

  let rows: PageStatRow[] = [];
  let popup: PageStats['popup'] = null;
  let login: PageStats['login'] = null;
  let activity: PageStats['activity'] = null;
  let sources: TrafficSourceRow[] = [];
  let error: string | null = null;
  try {
    [{ rows, popup, login, activity }, sources] = await Promise.all([
      pageStats(site, range.from, range.to, source),
      // 誘導元の一覧 (取れなくてもページ別の表示回数は出す)
      trafficSources(site, range.from, range.to).catch((e) => {
        console.error('[ga4] 誘導元を取得できませんでした', e instanceof Error ? e.message : e);
        return [] as TrafficSourceRow[];
      }),
    ]);
  } catch (e) {
    if (!(e instanceof Ga4NotConfiguredError)) console.error('[ga4]', e instanceof Error ? e.message : e);
    error = e instanceof Error ? e.message : 'GA4 から取得できませんでした';
  }
  // ログイン率 = ログイン人数 ÷ ポップアップ表示人数 (ポップアップなしでログインした人も含むので目安。100% で止める)
  const loginRate =
    login && popup && popup.users > 0 ? Math.min(100, Math.round((login.users / popup.users) * 1000) / 10) : null;
  const needle = q?.toLowerCase();
  const filtered = needle
    ? rows.filter((r) => r.path.toLowerCase().includes(needle) || r.title.toLowerCase().includes(needle))
    : rows;
  const sorted = sortRows(filtered, sort, (r, key) =>
    key === 'views' ? r.views : key === 'users' ? r.users : key === 'path' ? r.path : r.title,
  );
  const total = sorted.length;
  const shown = sorted.slice((page - 1) * perPage, page * perPage);
  const exportQuery = new URLSearchParams(
    Object.entries({ from: range.from, to: range.to, site: listParams.site, q, source }).filter(([, v]) => v) as [string, string][],
  ).toString();

  return (
    <div className="list-page">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="page-title mb-0">集計・分析</h1>
        {hasRole(admin.role, 'admin') && !error && (
          <a className="btn-sub" title="CSV ファイルをダウンロード" href={`/api/export/pageviews?${exportQuery}`}><icons.fileDownload className="h-4 w-4" />ダウンロード</a>
        )}
      </div>

      <SearchForm collapsible className="card mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="from">開始日</label>
          <input className="input" type="date" id="from" name="from" defaultValue={range.from} required />
        </div>
        <span className="pb-2 text-slate-500">〜</span>
        <div>
          <label className="label" htmlFor="to">終了日</label>
          <input className="input" type="date" id="to" name="to" defaultValue={range.to} required />
        </div>
        <div>
          <label className="label" htmlFor="source">誘導元</label>
          <select className="input w-56" id="source" name="source" defaultValue={source ?? ''}>
            <option value="">すべて</option>
            {TRAFFIC_SOURCES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-48 flex-1">
          <label className="label" htmlFor="q">ページの URL・タイトル</label>
          <input className="input" id="q" name="q" defaultValue={q ?? ''} placeholder="例）/service、/presents、プレゼント" />
        </div>
        {/* 絞り込んでも、今見ているタブのままにする */}
        {tab !== 'pages' && <input type="hidden" name="tab" value={tab} />}
        <SearchButton />
        <ClearButton href={tab === 'pages' ? '/pageviews' : `/pageviews?tab=${tab}`} />
      </SearchForm>
      <ActiveFilters
        basePath="/pageviews"
        params={{ ...listParams, sort: sp.sort, dir: sp.dir }}
        chips={[
          { key: 'source', label: '誘導元', value: source ? (TRAFFIC_SOURCES.find((t) => t.key === source)?.label ?? '') : '' },
          { key: 'q', label: 'キーワード', value: q ?? '' },
        ]}
      />
      {range.error && <p className="error mb-4">{range.error}</p>}
      <PageHelp title="集計・分析について">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>GA4 の数値は数時間遅れて反映されます。</li>
          <li>期間内にアクセスがあったページだけを、表示回数の多い順に表示します。</li>
          <li>ページの URL を押すと、そのページを別のタブで開きます。</li>
          <li>
            「ログインポップアップ」は、ログインを求めるポップアップを表示した回数と人数です。サイト内でログインが必要なリンクを押したときはそのとき開いていたページに、
            ログインが必要なページを直接開いたときはそのページに数えます（GA4 の数値なので数時間遅れます）。
          </li>
          <li>「主要KPI」の人数は期間内の人数です。同じ人は何回表示・ログインしても 1 人と数えます（ポップアップの人数は、同じ人が複数のページで表示しても 1 人のため、一覧の合計とは一致しません）。</li>
          <li>「ログイン数」「ログイン人数」は、期間内にサイトへログインした回数と会員の数です（ページ別ではなく合計のみ。すぐに反映されます）。</li>
          <li>
            「ログイン率」は、ログイン人数 ÷ ログインポップアップ表示人数です。ポップアップを出さずにログインした人も数えるため目安です（100% を超えるときは 100% と表示します）。
          </li>
          <li>「新規会員数」は期間内に初めてログインした会員の数、「申し込み件数」「誘導クリック数」はコンバージョン（申し込み・誘導）の件数です（すぐに反映されます）。</li>
          <li>
            「誘導元」は、訪問した人がどこから来たかです（Google 検索、LINE、ほかのサイトのリンクなど）。誘導元で絞り込むと、その誘導元から来た訪問の表示回数・ポップアップだけを表示します
            （ログイン数・ログイン人数・新規会員数・申し込み件数・誘導クリック数は誘導元が分からないため、絞り込みません）。
          </li>
          <li>LINE などのアプリ内から開いた訪問は、リンクに UTM パラメータが付いていないと「直接」に数えられることがあります。</li>
        </ul>
      </PageHelp>
      {error ? (
        <p className="error">ページ別の表示回数を取得できませんでした：{error}</p>
      ) : (
        <>
          <section className="mt-2">
            <div role="tablist" aria-label="表示の切り替え" className="flex items-end gap-1.5 pl-px">
              {TABS.map((t) => {
                const active = tab === t.key;
                return (
                  <a
                    key={t.key}
                    href={tabHref(t.key)}
                    role="tab"
                    aria-selected={active}
                    className={`relative flex w-48 items-center justify-center gap-1.5 rounded-t-lg border border-b-0 font-semibold ${
                      active
                        ? 'z-[2] -mb-px h-11 border-slate-200 bg-white pb-px text-brand'
                        : 'h-9 border-slate-200 bg-slate-100 text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                    }`}
                  >
                    <t.Icon className="h-4 w-4" />
                    {t.label}
                  </a>
                );
              })}
            </div>
            <div role="tabpanel" className="card relative z-[1] rounded-tl-none">
              {tab === 'pages' && (
                <>
              <div className="overflow-hidden rounded-lg border border-line">
            {/* 左右にスクロールしないよう、列の幅を固定する (URL・タイトルは長いと … で切る。マウスを乗せると全文) */}
            <table className="table w-full table-fixed">
              <thead>
                <tr>
                  <th className="w-16 text-right">順位</th>
                  <SortableTh label="ページの URL" sortKey="path" sort={sort} columns={SORT_COLUMNS} basePath="/pageviews" params={listParams} className="w-[34%]" />
                  <SortableTh label="タイトル" sortKey="title" sort={sort} columns={SORT_COLUMNS} basePath="/pageviews" params={listParams} />
                  <SortableTh label="表示回数" sortKey="views" sort={sort} columns={SORT_COLUMNS} basePath="/pageviews" params={listParams} className="w-32 text-right" />
                  <SortableTh label="ユーザー数" sortKey="users" sort={sort} columns={SORT_COLUMNS} basePath="/pageviews" params={listParams} className="w-32 text-right" />
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) => (
                  <tr key={r.path}>
                    <td className="text-right text-slate-400">{(page - 1) * perPage + i + 1}</td>
                    <td className="truncate">
                      {/* その環境のサイトのページを別タブで開く */}
                      <a
                        href={`${SITES[site].origin}${r.path}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        title={`${SITES[site].origin}${r.path}`}
                        className="text-brand hover:underline"
                      >
                        {r.path}
                      </a>
                    </td>
                    <td className="truncate text-slate-600" title={r.title}>
                      {/* 押すと、このページの誘導元の内訳を円グラフで出す */}
                      <PageSourcesButton path={r.path} title={r.title} query={{ from: range.from, to: range.to, site: listParams.site }} />
                      {r.title || '—'}
                    </td>
                    <td className="text-right font-semibold">{r.views.toLocaleString()}</td>
                    <td className="text-right">{r.users.toLocaleString()}</td>
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      {q ? '検索内容に一致するデータはありません。' : 'この期間のアクセスはありません。'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
                  <Pagination basePath="/pageviews" params={{ ...listParams, sort: sort.key, dir: sort.dir }} page={page} perPage={perPage} total={total} />
                </>
              )}
              {tab === 'sources' &&
                (sources.length > 0 ? (
                  <SourceBreakdown sources={sources} listParams={listParams} selected={source} />
                ) : (
                  <p className="py-8 text-center text-slate-500">この期間の誘導元のデータはありません。</p>
                ))}
              {tab === 'kpi' && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    { title: '新規会員数', value: activity?.newMembers ?? null, unit: '人' },
                    { title: 'ログイン数', value: login?.count ?? null, unit: '回' },
                    { title: 'ログイン人数', value: login?.users ?? null, unit: '人' },
                    { title: 'ログイン率（目安）', value: loginRate, unit: '%' },
                    { title: 'ログインポップアップ表示回数', value: popup?.count ?? null, unit: '回' },
                    { title: 'ログインポップアップ表示人数', value: popup?.users ?? null, unit: '人' },
                    { title: '申し込み件数', value: activity?.applications ?? null, unit: '件' },
                    { title: '誘導クリック数', value: activity?.clicks ?? null, unit: '回' },
                  ].map((card) => (
                    <div key={card.title} className="rounded-lg border border-slate-200 px-4 py-4">
                      <p className="text-sm font-semibold text-slate-600">{card.title}</p>
                      <p className="mt-1 leading-tight tabular-nums">
                        <span className="text-[26px] font-bold">{card.value === null ? '—' : card.value.toLocaleString()}</span>
                        {card.value !== null && <span className="ml-0.5 text-sm text-slate-600">{card.unit}</span>}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/**
 * 誘導元の内訳。誘導元を押すと、その誘導元で絞り込んだページ毎の表示回数に移る (選択中のものを押すと解除)。
 * 割合は、期間内の表示回数全体に対するもの。
 */
function SourceBreakdown({
  sources,
  listParams,
  selected,
}: {
  sources: TrafficSourceRow[];
  listParams: Record<string, string | undefined>;
  selected?: string;
}) {
  const totalViews = sources.reduce((n, s) => n + s.views, 0) || 1;
  const href = (key?: string) => {
    const params = new URLSearchParams(
      // 押したら、その誘導元で絞り込んだ「ページ毎の表示回数」に移る
      Object.entries({ ...listParams, source: key, tab: key ? undefined : listParams.tab }).filter(([, v]) => v) as [string, string][],
    );
    return `/pageviews?${params.toString()}`;
  };
  return (
    <div className="overflow-hidden rounded-lg border border-line">
        <table className="table">
          <thead>
            <tr>
              <th>誘導元</th>
              <th className="text-right">表示回数</th>
              <th className="text-right">割合</th>
              <th className="text-right">ユーザー数（目安）</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.key} className={s.key === selected ? 'bg-nav-active' : undefined}>
                <td>
                  <a
                    href={s.key === selected ? href(undefined) : href(s.key)}
                    className="text-brand hover:underline"
                    title={s.key === selected ? '絞り込みを解除する' : 'この誘導元で絞り込む'}
                  >
                    {s.label}
                  </a>
                </td>
                <td className="text-right font-semibold tabular-nums">{s.views.toLocaleString()}</td>
                <td className="text-right tabular-nums text-slate-600">{((s.views / totalViews) * 100).toFixed(1)}%</td>
                <td className="text-right tabular-nums">{s.users.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
    </div>
  );
}
