import type { Metadata } from 'next';
import { ActiveFilters } from '@/components/ActiveFilters';
import { Pagination, pageFrom, perPageFrom } from '@/components/Pagination';
import { ClearButton, SearchButton, SearchForm } from '@/components/SearchForm';
import { SortableTh } from '@/components/SortableTh';
import { hasRole } from '@/lib/adminUsers';
import { requireAdmin } from '@/lib/auth/guard';
import { resolveRange } from '@/lib/dateRange';
import { canChooseSite, Ga4NotConfiguredError, pageViewsByPath, PageViewRow, resolveSite, SITES } from '@/lib/ga4';
import { resolveSort, SortColumn, sortRows } from '@/lib/sort';

export const metadata: Metadata = { title: 'ページ別表示回数' };

/** 並べ替えできる列 (画面側で並べ替える) */
const SORT_COLUMNS: Record<string, SortColumn> = {
  views: { sql: '', firstDir: 'desc' },
  users: { sql: '', firstDir: 'desc' },
  path: { sql: '' },
  title: { sql: '' },
};

/**
 * サイトのページ別の表示回数 (GA4)。期間内にアクセスがあったページだけを、多い順に出す。
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

  let rows: PageViewRow[] = [];
  let error: string | null = null;
  try {
    rows = await pageViewsByPath(site, range.from, range.to);
  } catch (e) {
    if (!(e instanceof Ga4NotConfiguredError)) console.error('[ga4]', e instanceof Error ? e.message : e);
    error = e instanceof Error ? e.message : 'GA4 から取得できませんでした';
  }
  const needle = q?.toLowerCase();
  const filtered = needle
    ? rows.filter((r) => r.path.toLowerCase().includes(needle) || r.title.toLowerCase().includes(needle))
    : rows;
  const sorted = sortRows(filtered, sort, (r, key) => (key === 'views' ? r.views : key === 'users' ? r.users : key === 'path' ? r.path : r.title));
  const total = sorted.length;
  const shown = sorted.slice((page - 1) * perPage, page * perPage);
  const totalViews = filtered.reduce((sum, r) => sum + r.views, 0);
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
      {error ? (
        <p className="error">ページ別の表示回数を取得できませんでした：{error}</p>
      ) : (
        <>
          <p className="mb-2 text-sm text-slate-600">
            {range.from.replaceAll('-', '/')} 〜 {range.to.replaceAll('-', '/')} の合計{' '}
            <strong className="text-slate-900">{totalViews.toLocaleString()}</strong> 回（{total.toLocaleString()} ページ）
            <span className="ml-2 text-xs text-slate-400">※ GA4 の数値は数時間遅れて反映されます</span>
          </p>
          <div className="card table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th className="w-16 text-right">順位</th>
                  <SortableTh label="ページの URL" sortKey="path" sort={sort} columns={SORT_COLUMNS} basePath="/pageviews" params={listParams} />
                  <SortableTh label="タイトル" sortKey="title" sort={sort} columns={SORT_COLUMNS} basePath="/pageviews" params={listParams} />
                  <SortableTh label="表示回数" sortKey="views" sort={sort} columns={SORT_COLUMNS} basePath="/pageviews" params={listParams} className="text-right" />
                  <SortableTh label="ユーザー数" sortKey="users" sort={sort} columns={SORT_COLUMNS} basePath="/pageviews" params={listParams} className="text-right" />
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) => (
                  <tr key={r.path}>
                    <td className="text-right text-slate-400">{(page - 1) * perPage + i + 1}</td>
                    <td className="max-w-80 truncate" title={r.path}>{r.path}</td>
                    <td className="max-w-96 truncate text-slate-600" title={r.title}>{r.title || '—'}</td>
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
    </div>
  );
}
