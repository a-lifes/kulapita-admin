import type { Metadata } from 'next';
import { MemberButton } from '@/components/MemberButton';
import { Pagination, pageFrom, perPageFrom } from '@/components/Pagination';
import { SortableTh } from '@/components/SortableTh';
import { hasRole } from '@/lib/adminUsers';
import { requireAdmin } from '@/lib/auth/guard';
import { resolveRange } from '@/lib/dateRange';
import { query } from '@/lib/db';
import { formatJst } from '@/lib/format';
import { MEMBER_COLUMNS, memberFromRow } from '@/lib/members';
import { clickWhere, normalizeClickFilter } from '@/lib/queries/conversions';
import { orderBySql, resolveSort, SortColumn } from '@/lib/sort';
import { ClearButton, SearchButton, SearchForm } from '@/components/SearchForm';
import { getExternalServices } from '@/lib/microcms';

export const metadata: Metadata = { title: 'コンバージョン（誘導）' };

/** 並べ替えできる列 */
const SORT_COLUMNS: Record<string, SortColumn> = {
  created: { sql: 'k.created_at', firstDir: 'desc' },
  service: { sql: 'k.service_name' },
  company: { sql: 'k.service_company' },
  member: { sql: 'COALESCE(u.display_name, u.external_id)' },
  destination: { sql: 'k.destination_url' },
};


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

  const [{ rows }, { rows: count }, { rows: counted }, cms] = await Promise.all([
    query<Row>(
      `SELECT k.id, k.service_name, k.service_company, k.destination_url, k.placement, k.created_at, ${MEMBER_COLUMNS}
       FROM outbound_clicks k LEFT JOIN users u ON u.id = k.user_id
       WHERE ${where.sql}
       ORDER BY ${orderBySql(SORT_COLUMNS, sort, 'k.id DESC')} LIMIT :limit OFFSET :offset`,
      { ...where.params, limit: perPage, offset: (page - 1) * perPage },
    ),
    query<{ total: number; members: number }>(
      `SELECT COUNT(*) AS total, COUNT(k.user_id) AS members FROM outbound_clicks k LEFT JOIN users u ON u.id = k.user_id WHERE ${where.sql}`,
      where.params,
    ),
    query<SummaryRow>(
      `SELECT k.service_slug, MAX(k.service_name) AS service_name, COUNT(*) AS total, COUNT(k.user_id) AS members
       FROM outbound_clicks k LEFT JOIN users u ON u.id = k.user_id WHERE ${summaryWhere.sql}
       GROUP BY k.service_slug ORDER BY total DESC, service_name LIMIT 500`,
      summaryWhere.params,
    ),
    getExternalServices(),
  ]);
  // サービスの選択肢: microCMS で「CTA の種類」が externalSite のサービスすべてと、
  // microCMS に無くなったサービスでクリックが残っているもの。
  const summary: SummaryRow[] = [
    ...(cms.services ?? []).map((svc) => {
      const c = counted.find((r) => r.service_slug === svc.slug);
      return { service_slug: svc.slug, service_name: svc.name, total: Number(c?.total ?? 0), members: Number(c?.members ?? 0) };
    }),
    ...counted
      .filter((r) => !(cms.services ?? []).some((svc) => svc.slug === r.service_slug))
      .map((r) => ({ ...r, total: Number(r.total), members: Number(r.members) })),
  ].sort((a, b) => b.total - a.total || a.service_name.localeCompare(b.service_name, 'ja'));
  const total = Number(count[0]?.total ?? 0);
  const exportQuery = new URLSearchParams(
    Object.entries({ from: range.from, to: range.to, ...filter }).filter(([, v]) => v) as [string, string][],
  ).toString();

  return (
    <div className="list-page">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="page-title mb-0">コンバージョン（誘導）</h1>
        {hasRole(admin.role, 'admin') && (
          <a className="btn-sub" href={`/api/export/clicks?${exportQuery}`}>CSV ダウンロード</a>
        )}
      </div>

      {/* 絞り込み (他の画面と同じ 1 行の形) */}
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
        <div className="min-w-64 flex-1">
          <label className="label" htmlFor="q">サービス・会社・会員・誘導先</label>
          <input className="input" id="q" name="q" defaultValue={filter.q ?? ''} />
        </div>
        <SearchButton />
        <ClearButton href="/clicks" />
      </SearchForm>
      {range.error && <p className="error -mt-2 mb-4">{range.error}</p>}


      <div className="card table-scroll">
        <table className="table">
          <thead>
            <tr>
              <SortableTh label="クリック日時" sortKey="created" sort={sort} columns={SORT_COLUMNS} basePath="/clicks" params={listParams} />
              <SortableTh label="サービス" sortKey="service" sort={sort} columns={SORT_COLUMNS} basePath="/clicks" params={listParams} />
              <SortableTh label="サービス提供会社" sortKey="company" sort={sort} columns={SORT_COLUMNS} basePath="/clicks" params={listParams} />
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
                <td colSpan={5} className="py-8 text-center text-slate-500">
                  {filter.service || filter.q ? '検索内容に一致するデータはありません。' : 'この期間の誘導はありません。'}
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
