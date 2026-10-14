import type { Metadata } from 'next';
import Link from 'next/link';
import { Pagination, PAGE_SIZE, pageFrom } from '@/components/Pagination';
import { StatusBadge } from '@/components/StatusBadge';
import { hasRole } from '@/lib/adminUsers';
import { requireAdmin } from '@/lib/auth/guard';
import { query } from '@/lib/db';
import { CONTACT_ROUTE_LABEL, CONTACT_STATUS_LABEL, formatJst, label } from '@/lib/format';
import { CONTACT_ROUTES, CONTACT_STATUSES, contactWhere, normalizeContactFilter } from '@/lib/queries/contacts';

export const metadata: Metadata = { title: 'お問い合わせ' };

type Row = {
  id: string;
  reception_number: string;
  route: string;
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
  const where = contactWhere(filter);

  const [{ rows }, { rows: count }] = await Promise.all([
    query<Row>(
      `SELECT c.id, c.reception_number, c.route, c.category, c.service_name, c.name, c.email,
              c.status, c.created_at, a.display_name AS assignee
       FROM contacts c LEFT JOIN admin_users a ON a.id = c.assigned_to
       WHERE ${where.sql}
       ORDER BY c.created_at DESC LIMIT :limit OFFSET :offset`,
      { ...where.params, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
    ),
    query<{ total: number }>(`SELECT COUNT(*) AS total FROM contacts c WHERE ${where.sql}`, where.params),
  ]);
  const total = Number(count[0]?.total ?? 0);
  const exportQuery = new URLSearchParams(
    Object.entries(filter).filter(([, v]) => v) as [string, string][],
  ).toString();

  return (
    <>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="page-title mb-0">お問い合わせ</h1>
        {hasRole(admin.role, 'admin') && (
          <a className="btn-sub" href={`/api/export/contacts${exportQuery ? `?${exportQuery}` : ''}`}>
            CSV ダウンロード
          </a>
        )}
      </div>

      <form className="card mb-4 flex flex-wrap items-end gap-3">
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
          <label className="label" htmlFor="route">種別</label>
          <select className="input" id="route" name="route" defaultValue={filter.route ?? ''}>
            <option value="">すべて</option>
            {CONTACT_ROUTES.map((r) => (
              <option key={r} value={r}>{CONTACT_ROUTE_LABEL[r]}</option>
            ))}
          </select>
        </div>
        <div className="min-w-64 flex-1">
          <label className="label" htmlFor="q">受付番号・お名前・メール・電話</label>
          <input className="input" id="q" name="q" defaultValue={filter.q ?? ''} />
        </div>
        <button className="btn">絞り込む</button>
        <Link className="btn-sub" href="/contacts">クリア</Link>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>受付日時</th>
              <th>受付番号</th>
              <th>種別</th>
              <th>内容</th>
              <th>お名前</th>
              <th>メール</th>
              <th>対応状況</th>
              <th>担当</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td>{formatJst(r.created_at)}</td>
                <td>
                  <Link className="text-brand underline" href={`/contacts/${r.id}`}>
                    {r.reception_number}
                  </Link>
                </td>
                <td>{label(CONTACT_ROUTE_LABEL, r.route)}</td>
                <td>{r.route === 'service' ? r.service_name : r.category}</td>
                <td>{r.name}</td>
                <td>{r.email}</td>
                <td><StatusBadge value={r.status} text={label(CONTACT_STATUS_LABEL, r.status)} /></td>
                <td>{r.assignee ?? '—'}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-500">該当するお問い合わせはありません</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination basePath="/contacts" params={{ ...filter }} page={page} total={total} />
    </>
  );
}
