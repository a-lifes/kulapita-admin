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
import { canChooseSite, Ga4NotConfiguredError, resolveSite, SITES, TrafficSourceRow, trafficSources } from '@/lib/ga4';
import { Collapsible } from '@/components/Collapsible';
import { PageStatRow, PageStats, pageStats } from '@/lib/pageviewStats';
import { resolveSort, SortColumn, sortRows } from '@/lib/sort';

export const metadata: Metadata = { title: 'ページ別表示回数' };

/** 並べ替えできる列 (画面側で並べ替える) */
const SORT_COLUMNS: Record<string, SortColumn> = {
  views: { sql: '', firstDir: 'desc' },
  users: { sql: '', firstDir: 'desc' },
  popupCount: { sql: '', firstDir: 'desc' },
  popupUsers: { sql: '', firstDir: 'desc' },
  path: { sql: '' },
  title: { sql: '' },
};

/**
 * サイトのページ別の表示回数 (GA4)。期間内にアクセスがあったページだけを、多い順に出す。
 * あわせて、ログインポップアップの表示回数・人数 (GA4 のイベント) と、ログイン数・人数 (自前の DB) も出す。
 * 開くたびに GA4 に問い合わせる (同じ条件は 10 分だけ覚えておく)。
 */
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
  // 誘導元 (例: google / organic)。GA4 の sessionSourceMedium の値そのもの
  const source = sp.source?.trim().slice(0, 200) || undefined;
  const page = pageFrom(sp.page);
  const perPage = perPageFrom(sp.per);
  const sort = resolveSort(sp, SORT_COLUMNS, { key: 'views', dir: 'desc' });
  const listParams = { from: range.from, to: range.to, site: canChooseSite() ? site : undefined, q, source, per: sp.per };

  let rows: PageStatRow[] = [];
  let popup: PageStats['popup'] = null;
  let login: PageStats['login'] = null;
  let sources: TrafficSourceRow[] = [];
  let error: string | null = null;
  try {
    [{ rows, popup, login }, sources] = await Promise.all([
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
  const needle = q?.toLowerCase();
  const filtered = needle
    ? rows.filter((r) => r.path.toLowerCase().includes(needle) || r.title.toLowerCase().includes(needle))
    : rows;
  const sorted = sortRows(filtered, sort, (r, key) =>
    key === 'views' ? r.views : key === 'users' ? r.users : key === 'popupCount' ? r.popupCount : key === 'popupUsers' ? r.popupUsers : key === 'path' ? r.path : r.title,
  );
  const total = sorted.length;
  const shown = sorted.slice((page - 1) * perPage, page * perPage);
  const exportQuery = new URLSearchParams(
    Object.entries({ from: range.from, to: range.to, site: listParams.site, q, source }).filter(([, v]) => v) as [string, string][],
  ).toString();

  return (
    <div className="list-page">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="page-title mb-0">ページ別表示回数</h1>
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
        {canChooseSite() && (
          <div>
            <label className="label" htmlFor="site">サイト</label>
            <select className="input" id="site" name="site" defaultValue={site}>
              {Object.entries(SITES).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="label" htmlFor="source">誘導元</label>
          <select className="input max-w-72" id="source" name="source" defaultValue={source ?? ''}>
            <option value="">すべて</option>
            {/* 今選んでいる誘導元が期間内の一覧に無くても、選んだ状態を保つ */}
            {source && !sources.some((s) => s.key === source) && <option value={source}>{source}</option>}
            {sources.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}（{s.key}）
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-64 flex-1">
          <label className="label" htmlFor="q">ページの URL・タイトル</label>
          <input className="input" id="q" name="q" defaultValue={q ?? ''} placeholder="例）/service、/presents、プレゼント" />
        </div>
        <SearchButton />
        <ClearButton href="/pageviews" />
      </SearchForm>
      <ActiveFilters
        basePath="/pageviews"
        params={{ ...listParams, sort: sp.sort, dir: sp.dir }}
        chips={[
          { key: 'source', label: '誘導元', value: source ? (sources.find((s) => s.key === source)?.label ?? source) : '' },
          { key: 'q', label: 'キーワード', value: q ?? '' },
        ]}
      />
      {range.error && <p className="error mb-4">{range.error}</p>}
      <PageHelp title="ページ別表示回数について">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>GA4 の数値は数時間遅れて反映されます。</li>
          <li>期間内にアクセスがあったページだけを、表示回数の多い順に表示します。</li>
          <li>ページの URL を押すと、そのページを別のタブで開きます。</li>
          <li>
            「ログインポップアップ」は、ログインを求めるポップアップを表示した回数と人数です。サイト内でログインが必要なリンクを押したときはそのとき開いていたページに、
            ログインが必要なページを直接開いたときはそのページに数えます（GA4 の数値なので数時間遅れます）。
          </li>
          <li>上部の人数は期間内の人数です。同じ人は何回表示・ログインしても 1 人と数えます（ポップアップの人数は、同じ人が複数のページで表示しても 1 人のため、一覧の合計とは一致しません）。</li>
          <li>「ログイン数」「ログイン人数」は、期間内にサイトへログインした回数と会員の数です（ページ別ではなく合計のみ。すぐに反映されます）。</li>
          <li>
            「誘導元」は、訪問した人がどこから来たかです（Google 検索、LINE、ほかのサイトのリンクなど）。誘導元で絞り込むと、その誘導元から来た訪問の表示回数・ポップアップだけを表示します
            （ログイン数・ログイン人数は誘導元が分からないため、絞り込みません）。
          </li>
          <li>LINE などのアプリ内から開いた訪問は、リンクに UTM パラメータが付いていないと「直接」に数えられることがあります。</li>
        </ul>
      </PageHelp>
      {error ? (
        <p className="error">ページ別の表示回数を取得できませんでした：{error}</p>
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { title: 'ログインポップアップ表示回数', value: popup?.count ?? null, unit: '回' },
              { title: 'ログインポップアップ表示人数', value: popup?.users ?? null, unit: '人' },
              { title: 'ログイン数', value: login?.count ?? null, unit: '回' },
              { title: 'ログイン人数', value: login?.users ?? null, unit: '人' },
            ].map((card) => (
              <div key={card.title} className="card py-4">
                <p className="text-sm font-semibold text-slate-600">{card.title}</p>
                <p className="mt-1 leading-tight tabular-nums">
                  <span className="text-[26px] font-bold">{card.value === null ? '—' : card.value.toLocaleString()}</span>
                  {card.value !== null && <span className="ml-0.5 text-sm text-slate-600">{card.unit}</span>}
                </p>
              </div>
            ))}
          </div>
          {sources.length > 0 && <SourceBreakdown sources={sources} listParams={listParams} selected={source} />}
          <div className="card table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th className="w-16 text-right">順位</th>
                  <SortableTh label="ページの URL" sortKey="path" sort={sort} columns={SORT_COLUMNS} basePath="/pageviews" params={listParams} />
                  <SortableTh label="タイトル" sortKey="title" sort={sort} columns={SORT_COLUMNS} basePath="/pageviews" params={listParams} />
                  <SortableTh label="表示回数" sortKey="views" sort={sort} columns={SORT_COLUMNS} basePath="/pageviews" params={listParams} className="text-right" />
                  <SortableTh label="ユーザー数" sortKey="users" sort={sort} columns={SORT_COLUMNS} basePath="/pageviews" params={listParams} className="text-right" />
                  <SortableTh label="ポップアップ回数" sortKey="popupCount" sort={sort} columns={SORT_COLUMNS} basePath="/pageviews" params={listParams} className="text-right" />
                  <SortableTh label="ポップアップ人数" sortKey="popupUsers" sort={sort} columns={SORT_COLUMNS} basePath="/pageviews" params={listParams} className="text-right" />
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) => (
                  <tr key={r.path}>
                    <td className="text-right text-slate-400">{(page - 1) * perPage + i + 1}</td>
                    <td className="max-w-80 truncate">
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
                    <td className="max-w-96 truncate text-slate-600" title={r.title}>{r.title || '—'}</td>
                    <td className="text-right font-semibold">{r.views.toLocaleString()}</td>
                    <td className="text-right">{r.users.toLocaleString()}</td>
                    <td className="text-right">{r.popupCount ? r.popupCount.toLocaleString() : <span className="text-slate-300">0</span>}</td>
                    <td className="text-right">{r.popupUsers ? r.popupUsers.toLocaleString() : <span className="text-slate-300">0</span>}</td>
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
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
    </div>
  );
}

/**
 * 誘導元の内訳 (開閉できる)。誘導元を押すと、その誘導元でページ別の表示回数を絞り込む (もう一度押すと解除)。
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
      Object.entries({ ...listParams, source: key }).filter(([, v]) => v) as [string, string][],
    );
    return `/pageviews?${params.toString()}`;
  };
  return (
    <Collapsible storageKey="pageviews:sources" title="誘導元">
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>誘導元</th>
              <th>分類</th>
              <th>source / medium</th>
              <th className="text-right">表示回数</th>
              <th className="text-right">割合</th>
              <th className="text-right">ユーザー数</th>
            </tr>
          </thead>
          <tbody>
            {sources.slice(0, 20).map((s) => (
              <tr key={s.key} className={s.key === selected ? 'bg-nav-active' : undefined}>
                <td>
                  <a
                    href={s.key === selected ? href(undefined) : href(s.key)}
                    className="font-semibold text-brand hover:underline"
                    title={s.key === selected ? '絞り込みを解除する' : 'この誘導元で絞り込む'}
                  >
                    {s.label}
                  </a>
                </td>
                <td className="text-slate-600">{s.channel}</td>
                <td className="text-slate-500">{s.key}</td>
                <td className="text-right font-semibold tabular-nums">{s.views.toLocaleString()}</td>
                <td className="text-right tabular-nums text-slate-600">{((s.views / totalViews) * 100).toFixed(1)}%</td>
                <td className="text-right tabular-nums">{s.users.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sources.length > 20 && <p className="mt-2 text-xs text-slate-500">ほか {sources.length - 20} 件（上位 20 件を表示）</p>}
    </Collapsible>
  );
}
