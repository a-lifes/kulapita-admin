import type { Metadata } from 'next';
import Link from 'next/link';
import { Pagination, pageFrom, perPageFrom } from '@/components/Pagination';
import { StatusBadge } from '@/components/StatusBadge';
import { hasRole } from '@/lib/adminUsers';
import { requireAdmin } from '@/lib/auth/guard';
import { query } from '@/lib/db';
import { CONTACT_STATUS_LABEL, formatJst, label } from '@/lib/format';
import { CONTACT_CATEGORIES, CONTACT_STATUSES, contactWhere, normalizeContactFilter } from '@/lib/queries/contacts';
import { ClearButton, SearchButton, SearchForm } from '@/components/SearchForm';
import { SortableTh } from '@/components/SortableTh';
import { orderBySql, resolveSort, SortColumn } from '@/lib/sort';

export const metadata: Metadata = { title: 'お問い合わせ' };

/** 並べ替えできる列 */
const SORT_COLUMNS: Record<string, SortColumn> = {
  created: { sql: 'c.created_at', firstDir: 'desc' },
  number: { sql: 'c.reception_number' },
  content: { sql: 'c.category' },
  name: { sql: 'c.name' },
  email: { sql: 'c.email' },
  status: { sql: "FIELD(c.status, 'pending', 'in_progress', 'completed', 'archived')" },
  assignee: { sql: 'a.display_name' },
};

type Row = {
  id: string;
  reception_number: string;
  category: string | null;
  service_name: string | null;
  name: string;
  email: string;
  status: string;
  created_at: string;
  assignee: string | null;
};

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const filter = normalizeContactFilter(sp);
  const page = pageFrom(sp.page);
  const perPage = perPageFrom(sp.per);
  const where = contactWhere(filter);
  const sort = resolveSort(sp, SORT_COLUMNS, { key: 'created', dir: 'desc' });
  const listParams = { ...filter, per: sp.per };

  const [{ rows }, { rows: count }] = await Promise.all([
    query<Row>(
      `SELECT c.id, c.reception_number, c.category, c.service_name, c.name, c.email,
              c.status, c.created_at, a.display_name AS assignee
       FROM contacts c LEFT JOIN admin_users a ON a.id = c.assigned_to
       WHERE ${where.sql}
       ORDER BY ${orderBySql(SORT_COLUMNS, sort, 'c.id DESC')} LIMIT :limit OFFSET :offset`,
      { ...where.params, limit: perPage, offset: (page - 1) * perPage },
    ),
    query<{ total: number }>(`SELECT COUNT(*) AS total FROM contacts c WHERE ${where.sql}`, where.params),
  ]);
  const total = Number(count[0]?.total ?? 0);
  const exportQuery = new URLSearchParams(
    Object.entries(filter).filter(([, v]) => v) as [string, string][],
  ).toString();

  return (
    <div className="list-page">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="page-title mb-0">お問い合わせ</h1>
        {hasRole(admin.role, 'admin') && (
          <a className="btn-sub" href={`/api/export/contacts${exportQuery ? `?${exportQuery}` : ''}`}>
            CSV ダウンロード
          </a>
        )}
      </div>

      <SearchForm className="card mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="status">対応状況</label>
          <select className="input" id="status" name="status" defaultValue={filter.status ?? ''}>
            <option value="">すべて</option>
            {CONTACT_STATUSES.map((s) => (
              <option key={s} value={s}>{CONTACT_STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="category">お問い合わせの種類</label>
          <select className="input" id="category" name="category" defaultValue={filter.category ?? ''}>
            <option value="">すべて</option>
            {CONTACT_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="min-w-64 flex-1">
          <label className="label" htmlFor="q">受付番号・お名前・メール・電話</label>
          <input className="input" id="q" name="q" defaultValue={filter.q ?? ''} />
        </div>
        <SearchButton />
        <ClearButton href="/contacts" />
      </SearchForm>

      <div className="card table-scroll">
        <table className="table">
          <thead>
            <tr>
              <SortableTh label="受付日時" sortKey="created" sort={sort} columns={SORT_COLUMNS} basePath="/contacts" params={listParams} />
              <SortableTh label="受付番号" sortKey="number" sort={sort} columns={SORT_COLUMNS} basePath="/contacts" params={listParams} />
              <SortableTh label="お問い合わせの種類" sortKey="content" sort={sort} columns={SORT_COLUMNS} basePath="/contacts" params={listParams} />
              <SortableTh label="お名前" sortKey="name" sort={sort} columns={SORT_COLUMNS} basePath="/contacts" params={listParams} />
              <SortableTh label="メール" sortKey="email" sort={sort} columns={SORT_COLUMNS} basePath="/contacts" params={listParams} />
              <SortableTh label="対応状況" sortKey="status" sort={sort} columns={SORT_COLUMNS} basePath="/contacts" params={listParams} />
              <SortableTh label="担当" sortKey="assignee" sort={sort} columns={SORT_COLUMNS} basePath="/contacts" params={listParams} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{formatJst(r.created_at)}</td>
                <td>
                  <Link className="text-brand underline" href={`/contacts/${r.id}`}>
                    {r.reception_number}
                  </Link>
                </td>
                <td>{r.category}</td>
                <td>{r.name}</td>
                <td>{r.email}</td>
                <td><StatusBadge value={r.status} text={label(CONTACT_STATUS_LABEL, r.status)} /></td>
                <td>{r.assignee ?? '—'}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500">{filter.status || filter.category || filter.q ? '検索内容に一致するデータはありません。' : 'お問い合わせはまだありません。'}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination basePath="/contacts" params={{ ...listParams, sort: sort.key, dir: sort.dir }} page={page} perPage={perPage} total={total} />
    </div>
  );
}
