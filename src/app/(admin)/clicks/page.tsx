import type { Metadata } from 'next';
import Link from 'next/link';
import { MemberButton } from '@/components/MemberButton';
import { Pagination, pageFrom, perPageFrom } from '@/components/Pagination';
import { SortableTh } from '@/components/SortableTh';
import { hasRole } from '@/lib/adminUsers';
import { requireAdmin } from '@/lib/auth/guard';
import { rangePresets, resolveRange } from '@/lib/dateRange';
import { query } from '@/lib/db';
import { formatJst, label, PLACEMENT_LABEL } from '@/lib/format';
import { MEMBER_COLUMNS, memberFromRow } from '@/lib/members';
import { clickWhere, normalizeClickFilter, PLACEMENTS } from '@/lib/queries/conversions';
import { orderBySql, resolveSort, SortColumn } from '@/lib/sort';
import { DateRangeFilter } from '../DateRangeFilter';

export const metadata: Metadata = { title: 'コンバージョン（誘導）' };

/** 並べ替えできる列 */
const SORT_COLUMNS: Record<string, SortColumn> = {
  created: { sql: 'k.created_at', firstDir: 'desc' },
  service: { sql: 'k.service_name' },
  company: { sql: 'k.service_company' },
  placement: { sql: 'k.placement' },
  member: { sql: 'COALESCE(u.display_name, u.external_id)' },
  destination: { sql: 'k.destination_url' },
};

/** サービスごとの件数で表示する数 */
const SUMMARY_LIMIT = 12;

type Row = Record<string, unknown> & {
  id: string;
  service_name: string;
  service_company: string | null;
  destination_url: string;
  placement: string;
  created_at: string;
};

type SummaryRow = { service_slug: string; service_name: string; total: number; members: number };

export default async function ClicksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const range = resolveRange(sp);
  const filter = normalizeClickFilter(sp);
  const page = pageFrom(sp.page);
  const perPage = perPageFrom(sp.per);
  const where = clickWhere(filter, range);
  // サービスごとの件数は「サービス」以外の条件で集計する (サービスを選んでいても他と比べられるように)
  const summaryWhere = clickWhere({ ...filter, service: undefined }, range);
  const sort = resolveSort(sp, SORT_COLUMNS, { key: 'created', dir: 'desc' });
  const listParams = { from: range.from, to: range.to, ...filter, per: sp.per };

  const [{ rows }, { rows: count }, { rows: summary }] = await Promise.all([
    query<Row>(
      `SELECT k.id, k.service_name, k.service_company, k.destination_url, k.placement, k.created_at, ${MEMBER_COLUMNS}
       FROM outbound_clicks k LEFT JOIN users u ON u.id = k.user_id
       WHERE ${where.sql}
       ORDER BY ${orderBySql(SORT_COLUMNS, sort, 'k.id DESC')} LIMIT :limit OFFSET :offset`,
      { ...where.params, limit: perPage, offset: (page - 1) * perPage },
    ),
    query<{ total: number; members: number }>(
      `SELECT COUNT(*) AS total, COUNT(k.user_id) AS members FROM outbound_clicks k WHERE ${where.sql}`,
      where.params,
    ),
    query<SummaryRow>(
      `SELECT k.service_slug, MAX(k.service_name) AS service_name, COUNT(*) AS total, COUNT(k.user_id) AS members
       FROM outbound_clicks k WHERE ${summaryWhere.sql}
       GROUP BY k.service_slug ORDER BY total DESC, service_name LIMIT 500`,
      summaryWhere.params,
    ),
  ]);
  const total = Number(count[0]?.total ?? 0);
  const memberClicks = Number(count[0]?.members ?? 0);
  const exportQuery = new URLSearchParams(
    Object.entries({ from: range.from, to: range.to, ...filter }).filter(([, v]) => v) as [string, string][],
  ).toString();
  const serviceHref = (slug?: string) =>
    `/clicks?${new URLSearchParams(
      Object.entries({ from: range.from, to: range.to, placement: filter.placement, service: slug }).filter(
        ([, v]) => v,
      ) as [string, string][],
    )}`;

  return (
    <div className="list-page">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="page-title mb-0">コンバージョン（誘導）</h1>
        {hasRole(admin.role, 'admin') && (
          <a className="btn-sub" href={`/api/export/clicks?${exportQuery}`}>CSV ダウンロード</a>
        )}
      </div>

      <div className="card mb-4">
        <DateRangeFilter
          from={range.from}
          to={range.to}
          presets={rangePresets()}
          basePath="/clicks"
          keep={{ service: filter.service, placement: filter.placement }}
        >
          <div>
            <label className="label" htmlFor="service">サービス</label>
            <select className="input max-w-72" id="service" name="service" defaultValue={filter.service ?? ''}>
              <option value="">すべて</option>
              {summary.map((s) => (
                <option key={s.service_slug} value={s.service_slug}>{s.service_name}</option>
              ))}
              {filter.service && !summary.some((s) => s.service_slug === filter.service) && (
                <option value={filter.service}>{filter.service}</option>
              )}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="placement">ボタンの場所</label>
            <select className="input" id="placement" name="placement" defaultValue={filter.placement ?? ''}>
              <option value="">すべて</option>
              {PLACEMENTS.map((p) => (
                <option key={p} value={p}>{PLACEMENT_LABEL[p]}</option>
              ))}
            </select>
          </div>
        </DateRangeFilter>
        {range.error && <p className="error mt-3">{range.error}</p>}
      </div>

      {summary.length > 0 && (
        <div className="card mb-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold">
              サービスごとの誘導数（{range.from.replaceAll('-', '/')} 〜 {range.to.replaceAll('-', '/')}）
            </h2>
            <p className="text-slate-600">
              表示中の条件で {total.toLocaleString()} 件（うちログイン中の会員 {memberClicks.toLocaleString()} 件）
            </p>
          </div>
          <ul className="flex flex-wrap gap-2">
            {summary.slice(0, SUMMARY_LIMIT).map((s) => {
              const active = s.service_slug === filter.service;
              return (
                <li key={s.service_slug}>
                  <Link
                    href={active ? serviceHref() : serviceHref(s.service_slug)}
                    title={active ? '絞り込みを解除する' : 'このサービスで絞り込む'}
                    className={`block rounded border px-3 py-1.5 ${
                      active ? 'border-brand bg-nav-active text-brand' : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {s.service_name}
                    <span className="ml-2 font-bold">{Number(s.total).toLocaleString()}</span> 件
                  </Link>
                </li>
              );
            })}
            {summary.length > SUMMARY_LIMIT && (
              <li className="self-center text-slate-500">ほか {summary.length - SUMMARY_LIMIT} サービス</li>
            )}
          </ul>
        </div>
      )}

      <div className="card table-scroll">
        <table className="table">
          <thead>
            <tr>
              <SortableTh label="日時" sortKey="created" sort={sort} columns={SORT_COLUMNS} basePath="/clicks" params={listParams} />
              <SortableTh label="サービス" sortKey="service" sort={sort} columns={SORT_COLUMNS} basePath="/clicks" params={listParams} />
              <SortableTh label="サービス提供会社" sortKey="company" sort={sort} columns={SORT_COLUMNS} basePath="/clicks" params={listParams} />
              <SortableTh label="ボタンの場所" sortKey="placement" sort={sort} columns={SORT_COLUMNS} basePath="/clicks" params={listParams} />
              <SortableTh label="会員" sortKey="member" sort={sort} columns={SORT_COLUMNS} basePath="/clicks" params={listParams} />
              <SortableTh label="誘導先" sortKey="destination" sort={sort} columns={SORT_COLUMNS} basePath="/clicks" params={listParams} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const member = memberFromRow(r);
              return (
                <tr key={r.id}>
                  <td>{formatJst(r.created_at)}</td>
                  <td className="max-w-64 truncate" title={r.service_name}>{r.service_name}</td>
                  <td className="max-w-56 truncate" title={r.service_company ?? undefined}>{r.service_company ?? '—'}</td>
                  <td>{label(PLACEMENT_LABEL, r.placement)}</td>
                  <td>
                    {member ? (
                      <MemberButton
                        member={member}
                        label={member.display_name ?? member.external_id}
                        formatted={{
                          first_authenticated_at: formatJst(member.first_authenticated_at),
                          last_login_at: formatJst(member.last_login_at),
                          profile_updated_at: formatJst(member.profile_updated_at),
                        }}
                      />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="max-w-80 truncate">
                    <a
                      className="text-brand underline"
                      href={r.destination_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      title={r.destination_url}
                    >
                      {r.destination_url}
                    </a>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-500">
                  {filter.service || filter.placement ? '検索内容に一致するデータはありません。' : 'この期間の誘導はありません。'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination basePath="/clicks" params={{ ...listParams, sort: sort.key, dir: sort.dir }} page={page} perPage={perPage} total={total} />
    </div>
  );
}
