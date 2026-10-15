import type { Metadata } from 'next';
import Link from 'next/link';
import { MemberButton } from '@/components/MemberButton';
import { Pagination, pageFrom, perPageFrom } from '@/components/Pagination';
import { ClearButton, SearchButton, SearchForm } from '@/components/SearchForm';
import { SortableTh } from '@/components/SortableTh';
import { StatusBadge } from '@/components/StatusBadge';
import { hasRole } from '@/lib/adminUsers';
import { requireAdmin } from '@/lib/auth/guard';
import { CASE_COLUMN_WIDTH, CASE_STATUSES } from '@/lib/caseStatus';
import { query } from '@/lib/db';
import { CONTACT_STATUS_LABEL, formatJst, label } from '@/lib/format';
import { MEMBER_COLUMNS, memberFromRow } from '@/lib/members';
import { applicationWhere, normalizeApplicationFilter } from '@/lib/queries/conversions';
import { orderBySql, resolveSort, SortColumn } from '@/lib/sort';
import { RelTime } from '@/components/RelTime';
import { ActiveFilters } from '@/components/ActiveFilters';
import { ClickableRow } from '@/components/ClickableRow';

export const metadata: Metadata = { title: 'コンバージョン（申し込み）' };

/** 並べ替えできる列 */
const SORT_COLUMNS: Record<string, SortColumn> = {
  created: { sql: 's.created_at', firstDir: 'desc' },
  number: { sql: 's.reception_number' },
  service: { sql: 's.service_name' },
  company: { sql: 's.service_company' },
  name: { sql: 's.name' },
  member: { sql: 'COALESCE(u.display_name, u.external_id)' },
  status: { sql: "FIELD(s.status, 'pending', 'in_progress', 'completed', 'archived')" },
  assignee: { sql: 'a.display_name' },
};

type Row = Record<string, unknown> & {
  id: string;
  reception_number: string;
  service_name: string | null;
  service_company: string | null;
  name: string;
  status: string;
  created_at: string;
  assignee: string | null;
};

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const filter = normalizeApplicationFilter(sp);
  const page = pageFrom(sp.page);
  const perPage = perPageFrom(sp.per);
  const where = applicationWhere(filter);
  const sort = resolveSort(sp, SORT_COLUMNS, { key: 'created', dir: 'desc' });
  const listParams = { ...filter, per: sp.per };

  const [{ rows }, { rows: count }, { rows: services }] = await Promise.all([
    query<Row>(
      `SELECT s.id, s.reception_number, s.service_name, s.service_company, s.name, s.status, s.created_at,
              a.display_name AS assignee, ${MEMBER_COLUMNS}
       FROM service_applications s
       LEFT JOIN admin_users a ON a.id = s.assigned_to
       LEFT JOIN users u ON u.id = s.user_id
       WHERE ${where.sql}
       ORDER BY ${orderBySql(SORT_COLUMNS, sort, 's.id DESC')} LIMIT :limit OFFSET :offset`,
      { ...where.params, limit: perPage, offset: (page - 1) * perPage },
    ),
    query<{ total: number }>(`SELECT COUNT(*) AS total FROM service_applications s WHERE ${where.sql}`, where.params),
    query<{ service_name: string; total: number }>(
      `SELECT service_name, COUNT(*) AS total FROM service_applications
       WHERE deleted_at IS NULL AND service_name IS NOT NULL
       GROUP BY service_name ORDER BY service_name LIMIT 500`,
    ),
  ]);
  const total = Number(count[0]?.total ?? 0);
  const exportQuery = new URLSearchParams(
    Object.entries(filter).filter(([, v]) => v) as [string, string][],
  ).toString();

  return (
    <div className="list-page">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="page-title mb-0">コンバージョン（申し込み）</h1>
        {hasRole(admin.role, 'admin') && (
          <a className="btn-sub" href={`/api/export/applications${exportQuery ? `?${exportQuery}` : ''}`}>
            CSV ダウンロード
          </a>
        )}
      </div>

      <SearchForm className="card mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="status">対応状況</label>
          <select className="input" id="status" name="status" defaultValue={filter.status ?? ''}>
            <option value="">すべて</option>
            {CASE_STATUSES.map((s) => (
              <option key={s} value={s}>{CONTACT_STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="service">サービス</label>
          <select className="input max-w-72" id="service" name="service" defaultValue={filter.service ?? ''}>
            <option value="">すべて</option>
            {services.map((s) => (
              <option key={s.service_name} value={s.service_name}>{s.service_name}</option>
            ))}
          </select>
        </div>
        <div className="min-w-64 flex-1">
          <label className="label" htmlFor="q">受付番号・お名前・メール・電話</label>
          <input className="input" id="q" name="q" defaultValue={filter.q ?? ''} />
        </div>
        <SearchButton />
        <ClearButton href="/applications" />
      </SearchForm>
      <ActiveFilters basePath="/applications" params={{ ...listParams, sort: sp.sort, dir: sp.dir }} chips={[{ key: 'status', label: '対応状況', value: filter.status ? CONTACT_STATUS_LABEL[filter.status] : '' }, { key: 'service', label: 'サービス', value: filter.service ?? '' }, { key: 'q', label: 'キーワード', value: filter.q ?? '' }]} />

      <div className="card table-scroll">
        <table className="table">
          <thead>
            <tr>
              <SortableTh label="受付日時" sortKey="created" sort={sort} columns={SORT_COLUMNS} basePath="/applications" params={listParams} className={CASE_COLUMN_WIDTH.created} />
              <SortableTh label="受付番号" sortKey="number" sort={sort} columns={SORT_COLUMNS} basePath="/applications" params={listParams} className={CASE_COLUMN_WIDTH.number} />
              <SortableTh label="対応状況" sortKey="status" sort={sort} columns={SORT_COLUMNS} basePath="/applications" params={listParams} className={CASE_COLUMN_WIDTH.status} />
              <SortableTh label="サービス" sortKey="service" sort={sort} columns={SORT_COLUMNS} basePath="/applications" params={listParams} />
              <SortableTh label="サービス提供会社" sortKey="company" sort={sort} columns={SORT_COLUMNS} basePath="/applications" params={listParams} />
              <SortableTh label="お名前" sortKey="name" sort={sort} columns={SORT_COLUMNS} basePath="/applications" params={listParams} />
              <SortableTh label="会員" sortKey="member" sort={sort} columns={SORT_COLUMNS} basePath="/applications" params={listParams} />
              <SortableTh label="担当" sortKey="assignee" sort={sort} columns={SORT_COLUMNS} basePath="/applications" params={listParams} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const member = memberFromRow(r);
              return (
                <ClickableRow key={r.id} href={`/applications/${r.id}`}>
                  <td><RelTime value={r.created_at} /></td>
                  <td>
                    <Link className="text-brand hover:underline" href={`/applications/${r.id}`}>
                      {r.reception_number}
                    </Link>
                  </td>
                  <td><StatusBadge value={r.status} text={label(CONTACT_STATUS_LABEL, r.status)} /></td>
                  <td className="max-w-64 truncate" title={r.service_name ?? undefined}>{r.service_name ?? '—'}</td>
                  <td className="max-w-56 truncate" title={r.service_company ?? undefined}>{r.service_company ?? '—'}</td>
                  <td>{r.name}</td>
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
                  <td>{r.assignee ?? '—'}</td>
                </ClickableRow>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-500">
                  {filter.status || filter.service || filter.q ? '検索内容に一致するデータはありません。' : 'サービスの申し込みはまだありません。'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination basePath="/applications" params={{ ...listParams, sort: sort.key, dir: sort.dir }} page={page} perPage={perPage} total={total} />
    </div>
  );
}
