import type { Metadata } from 'next';
import { Pagination, pageFrom, perPageFrom } from '@/components/Pagination';
import { StatusBadge } from '@/components/StatusBadge';
import { hasRole } from '@/lib/adminUsers';
import { requireAdmin } from '@/lib/auth/guard';
import { query } from '@/lib/db';
import { formatJst, label, NEWSLETTER_STATUS_LABEL } from '@/lib/format';
import { NEWSLETTER_STATUSES, newsletterWhere, normalizeNewsletterFilter } from '@/lib/queries/lists';
import { ClearButton, SearchButton, SearchForm } from '@/components/SearchForm';
import { SortableTh } from '@/components/SortableTh';
import { orderBySql, resolveSort, SortColumn } from '@/lib/sort';

export const metadata: Metadata = { title: 'メルマガ' };

/** 並べ替えできる列 */
const SORT_COLUMNS: Record<string, SortColumn> = {
  subscribed: { sql: 'n.subscribed_at', firstDir: 'desc' },
  email: { sql: 'n.email' },
  name: { sql: "CONCAT(IFNULL(n.last_name, ''), IFNULL(n.first_name, ''))" },
  member: { sql: 'u.external_id' },
  status: { sql: "FIELD(n.status, 'active', 'pending', 'unsubscribed', 'bounced')" },
  unsubscribed: { sql: 'n.unsubscribed_at', firstDir: 'desc' },
};

type Row = {
  id: string;
  email: string;
  last_name: string | null;
  first_name: string | null;
  status: string;
  member_id: string | null;
  subscribed_at: string;
  unsubscribed_at: string | null;
};

export default async function NewsletterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const filter = normalizeNewsletterFilter(sp);
  const page = pageFrom(sp.page);
  const perPage = perPageFrom(sp.per);
  const where = newsletterWhere(filter);
  const sort = resolveSort(sp, SORT_COLUMNS, { key: 'subscribed', dir: 'desc' });
  const listParams = { ...filter, per: sp.per };

  const [{ rows }, { rows: count }] = await Promise.all([
    query<Row>(
      `SELECT n.id, n.email, n.last_name, n.first_name, n.status, u.external_id AS member_id,
              n.subscribed_at, n.unsubscribed_at
       FROM newsletter_subscribers n LEFT JOIN users u ON u.id = n.user_id
       WHERE ${where.sql}
       ORDER BY ${orderBySql(SORT_COLUMNS, sort, 'n.id DESC')} LIMIT :limit OFFSET :offset`,
      { ...where.params, limit: perPage, offset: (page - 1) * perPage },
    ),
    query<{ total: number }>(`SELECT COUNT(*) AS total FROM newsletter_subscribers n WHERE ${where.sql}`, where.params),
  ]);
  const total = Number(count[0]?.total ?? 0);
  const exportQuery = new URLSearchParams(Object.entries(filter).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <div className="list-page">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="page-title mb-0">メルマガ</h1>
        {hasRole(admin.role, 'admin') && (
          <a className="btn-sub" href={`/api/export/newsletter${exportQuery ? `?${exportQuery}` : ''}`}>CSV ダウンロード</a>
        )}
      </div>
      <SearchForm className="card mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="status">状態</label>
          <select className="input" id="status" name="status" defaultValue={filter.status ?? ''}>
            <option value="">すべて</option>
            {NEWSLETTER_STATUSES.map((s) => (
              <option key={s} value={s}>{NEWSLETTER_STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>
        <div className="min-w-64 flex-1">
          <label className="label" htmlFor="q">メール・お名前</label>
          <input className="input" id="q" name="q" defaultValue={filter.q ?? ''} />
        </div>
        <SearchButton />
        <ClearButton href="/newsletter" />
      </SearchForm>
      <div className="card table-scroll">
        <table className="table">
          <thead>
            <tr>
              <SortableTh label="登録日時" sortKey="subscribed" sort={sort} columns={SORT_COLUMNS} basePath="/newsletter" params={listParams} />
              <SortableTh label="メール" sortKey="email" sort={sort} columns={SORT_COLUMNS} basePath="/newsletter" params={listParams} />
              <SortableTh label="お名前" sortKey="name" sort={sort} columns={SORT_COLUMNS} basePath="/newsletter" params={listParams} />
              <SortableTh label="会員番号" sortKey="member" sort={sort} columns={SORT_COLUMNS} basePath="/newsletter" params={listParams} />
              <SortableTh label="状態" sortKey="status" sort={sort} columns={SORT_COLUMNS} basePath="/newsletter" params={listParams} />
              <SortableTh label="解除日時" sortKey="unsubscribed" sort={sort} columns={SORT_COLUMNS} basePath="/newsletter" params={listParams} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{formatJst(r.subscribed_at)}</td>
                <td>{r.email}</td>
                <td>{[r.last_name, r.first_name].filter(Boolean).join(' ') || '—'}</td>
                <td>{r.member_id ?? '—'}</td>
                <td><StatusBadge value={r.status} text={label(NEWSLETTER_STATUS_LABEL, r.status)} /></td>
                <td>{formatJst(r.unsubscribed_at) || '—'}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="py-8 text-center text-slate-500">{filter.status || filter.q ? '検索内容に一致するデータはありません。' : 'メルマガの登録者はまだいません。'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination basePath="/newsletter" params={{ ...listParams, sort: sort.key, dir: sort.dir }} page={page} perPage={perPage} total={total} />
    </div>
  );
}
