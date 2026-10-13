import Link from 'next/link';
import { Pagination, PAGE_SIZE, pageFrom } from '@/components/Pagination';
import { StatusBadge } from '@/components/StatusBadge';
import { hasRole } from '@/lib/adminUsers';
import { requireAdmin } from '@/lib/auth/guard';
import { query } from '@/lib/db';
import { formatJst, label, PRESENT_STATUS_LABEL } from '@/lib/format';
import { normalizePresentFilter, PRESENT_STATUSES, presentWhere } from '@/lib/queries/lists';

type Row = {
  id: string;
  campaign_key: string;
  item_index: number;
  item_name: string;
  email: string | null;
  status: string;
  member_id: string | null;
  created_at: string;
};

export default async function PresentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const filter = normalizePresentFilter(sp);
  const page = pageFrom(sp.page);
  const where = presentWhere(filter);

  const [{ rows }, { rows: count }, { rows: summary }] = await Promise.all([
    query<Row>(
      `SELECT p.id, p.campaign_key, p.item_index, p.item_name, p.email, p.status,
              u.external_id AS member_id, p.created_at
       FROM present_applications p LEFT JOIN users u ON u.id = p.user_id
       WHERE ${where.sql}
       ORDER BY p.created_at DESC LIMIT :limit OFFSET :offset`,
      { ...where.params, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
    ),
    query<{ total: number }>(`SELECT COUNT(*) AS total FROM present_applications p WHERE ${where.sql}`, where.params),
    query<{ campaign_key: string; item_index: number; item_name: string; total: number }>(
      `SELECT campaign_key, item_index, MAX(item_name) AS item_name, COUNT(*) AS total
       FROM present_applications GROUP BY campaign_key, item_index
       ORDER BY campaign_key DESC, item_index LIMIT 200`,
    ),
  ]);
  const total = Number(count[0]?.total ?? 0);
  const campaigns = [...new Set(summary.map((s) => s.campaign_key))];
  const shownSummary = summary.filter((s) => s.campaign_key === (filter.campaign ?? campaigns[0]));
  const exportQuery = new URLSearchParams(Object.entries(filter).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="page-title mb-0">プレゼント応募</h1>
        {hasRole(admin.role, 'admin') && (
          <a className="btn-sub" href={`/api/export/presents${exportQuery ? `?${exportQuery}` : ''}`}>CSV ダウンロード</a>
        )}
      </div>

      {shownSummary.length > 0 && (
        <div className="card mb-4">
          <h2 className="mb-3 text-sm font-bold">景品ごとの応募数 ({shownSummary[0].campaign_key})</h2>
          <ul className="flex flex-wrap gap-3 text-sm">
            {shownSummary.map((s) => (
              <li key={s.item_index} className="rounded border border-slate-200 px-3 py-2">
                {Number(s.item_index) + 1}. {s.item_name}：<strong>{Number(s.total).toLocaleString()}</strong> 件
              </li>
            ))}
          </ul>
        </div>
      )}

      <form className="card mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="campaign">キャンペーン (月)</label>
          <select className="input" id="campaign" name="campaign" defaultValue={filter.campaign ?? ''}>
            <option value="">すべて</option>
            {campaigns.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="status">結果</label>
          <select className="input" id="status" name="status" defaultValue={filter.status ?? ''}>
            <option value="">すべて</option>
            {PRESENT_STATUSES.map((s) => (
              <option key={s} value={s}>{PRESENT_STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>
        <button className="btn">絞り込む</button>
        <Link className="btn-sub" href="/presents">クリア</Link>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>応募日時</th>
              <th>キャンペーン</th>
              <th>景品</th>
              <th>会員番号</th>
              <th>メール</th>
              <th>結果</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap">{formatJst(r.created_at)}</td>
                <td>{r.campaign_key}</td>
                <td>{Number(r.item_index) + 1}. {r.item_name}</td>
                <td>{r.member_id ?? '—'}</td>
                <td className="break-all">{r.email ?? '—'}</td>
                <td><StatusBadge value={r.status} text={label(PRESENT_STATUS_LABEL, r.status)} /></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="py-8 text-center text-slate-500">該当する応募はありません</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination basePath="/presents" params={{ ...filter }} page={page} total={total} />
    </>
  );
}
