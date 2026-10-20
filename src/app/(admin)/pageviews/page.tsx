import type { Metadata } from 'next';
import { ActiveFilters } from '@/components/ActiveFilters';
import { PageHelp } from '@/components/PageHelp';
import { Pagination, pageFrom, perPageFrom } from '@/components/Pagination';
import { ClearButton, SearchButton, SearchForm } from '@/components/SearchForm';
import { SortableTh } from '@/components/SortableTh';
import { hasRole } from '@/lib/adminUsers';
import { requireAdmin } from '@/lib/auth/guard';
import { resolveRange } from '@/lib/dateRange';
import { canChooseSite, Ga4NotConfiguredError, resolveSite, SITES } from '@/lib/ga4';
import { PageStatRow, pageStats } from '@/lib/pageviewStats';
import { resolveSort, SortColumn, sortRows } from '@/lib/sort';

export const metadata: Metadata = { title: 'ページ別表示回数' };

/** 並べ替えできる列 (画面側で並べ替える) */
const SORT_COLUMNS: Record<string, SortColumn> = {
  views: { sql: '', firstDir: 'desc' },
  users: { sql: '', firstDir: 'desc' },
  popups: { sql: '', firstDir: 'desc' },
  path: { sql: '' },
  title: { sql: '' },
};

/**
 * サイトのページ別の表示回数 (GA4)。期間内にアクセスがあったページだけを、多い順に出す。
 * あわせて、ログインポップアップを表示した人数 (GA4 のイベント) とログインした人数 (自前の DB) も出す。
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
  const page = pageFrom(sp.page);
  const perPage = perPageFrom(sp.per);
  const sort = resolveSort(sp, SORT_COLUMNS, { key: 'views', dir: 'desc' });
  const listParams = { from: range.from, to: range.to, site: canChooseSite() ? site : undefined, q, per: sp.per };

  let rows: PageStatRow[] = [];
  let popupUsers: number | null = null;
  let loginUsers: number | null = null;
  let error: string | null = null;
  try {
    ({ rows, popupUsers, loginUsers } = await pageStats(site, range.from, range.to));
  } catch (e) {
    if (!(e instanceof Ga4NotConfiguredError)) console.error('[ga4]', e instanceof Error ? e.message : e);
    error = e instanceof Error ? e.message : 'GA4 から取得できませんでした';
  }
  const needle = q?.toLowerCase();
  const filtered = needle
    ? rows.filter((r) => r.path.toLowerCase().includes(needle) || r.title.toLowerCase().includes(needle))
    : rows;
  const sorted = sortRows(filtered, sort, (r, key) =>
    key === 'views' ? r.views : key === 'users' ? r.users : key === 'popups' ? r.popups : key === 'path' ? r.path : r.title,
  );
  const total = sorted.length;
  const shown = sorted.slice((page - 1) * perPage, page * perPage);
  const exportQuery = new URLSearchParams(
    Object.entries({ from: range.from, to: range.to, site: listParams.site, q }).filter(([, v]) => v) as [string, string][],
  ).toString();

  return (
    <div className="list-page">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="page-title mb-0">ページ別表示回数</h1>
        {hasRole(admin.role, 'admin') && !error && (
          <a className="btn-sub" href={`/api/export/pageviews?${exportQuery}`}>CSV ダウンロード</a>
        )}
      </div>

      <SearchForm className="card mb-4 flex flex-wrap items-end gap-3">
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
        <div className="min-w-64 flex-1">
          <label className="label" htmlFor="q">ページの URL・タイトル</label>
          <input className="input" id="q" name="q" defaultValue={q ?? ''} />
        </div>
        <SearchButton />
        <ClearButton href="/pageviews" />
      </SearchForm>
      <ActiveFilters
        basePath="/pageviews"
        params={{ ...listParams, sort: sp.sort, dir: sp.dir }}
        chips={[{ key: 'q', label: 'キーワード', value: q ?? '' }]}
      />
      {range.error && <p className="error mb-4">{range.error}</p>}
      <PageHelp title="ページ別表示回数について">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>GA4 の数値は数時間遅れて反映されます。</li>
          <li>期間内にアクセスがあったページだけを、表示回数の多い順に表示します。</li>
          <li>ページの URL を押すと、そのページを別のタブで開きます。</li>
          <li>
            「ログインポップアップ」は、ログインを求めるポップアップを表示した人数です。サイト内でログインが必要なリンクを押したときはそのとき開いていたページに、
            ログインが必要なページを直接開いたときはそのページに数えます（GA4 の数値なので数時間遅れます）。
          </li>
          <li>上部の「ログインポップアップ表示人数」は期間内の人数です。同じ人が複数のページで表示しても 1 人と数えるため、一覧の合計とは一致しません。</li>
          <li>「ログイン人数」は、期間内にサイトへログインした会員の数です。同じ会員が何度ログインしても 1 人です（ページ別ではなく合計のみ。すぐに反映されます）。</li>
        </ul>
      </PageHelp>
      {error ? (
        <p className="error">ページ別の表示回数を取得できませんでした：{error}</p>
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { title: 'ログインポップアップ表示人数', value: popupUsers },
              { title: 'ログイン人数', value: loginUsers },
            ].map((card) => (
              <div key={card.title} className="card py-4">
                <p className="text-sm font-semibold text-slate-600">{card.title}</p>
                <p className="mt-1 leading-tight tabular-nums">
                  <span className="text-[26px] font-bold">{card.value === null ? '—' : card.value.toLocaleString()}</span>
                  {card.value !== null && <span className="ml-0.5 text-sm text-slate-600">人</span>}
                </p>
              </div>
            ))}
          </div>
          <div className="card table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th className="w-16 text-right">順位</th>
                  <SortableTh label="ページの URL" sortKey="path" sort={sort} columns={SORT_COLUMNS} basePath="/pageviews" params={listParams} />
                  <SortableTh label="タイトル" sortKey="title" sort={sort} columns={SORT_COLUMNS} basePath="/pageviews" params={listParams} />
                  <SortableTh label="表示回数" sortKey="views" sort={sort} columns={SORT_COLUMNS} basePath="/pageviews" params={listParams} className="text-right" />
                  <SortableTh label="ユーザー数" sortKey="users" sort={sort} columns={SORT_COLUMNS} basePath="/pageviews" params={listParams} className="text-right" />
                  <SortableTh label="ログインポップアップ" sortKey="popups" sort={sort} columns={SORT_COLUMNS} basePath="/pageviews" params={listParams} className="text-right" />
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
                    <td className="text-right">{r.popups ? r.popups.toLocaleString() : <span className="text-slate-300">0</span>}</td>
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
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
