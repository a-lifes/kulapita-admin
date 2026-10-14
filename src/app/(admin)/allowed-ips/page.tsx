import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/guard';
import { query } from '@/lib/db';
import { cidrContains, isIpv4 } from '@/lib/cidr';
import { formatJst } from '@/lib/format';
import { AddIpButton, DeleteIpButton, EditIpButton, ResyncButton } from './IpForms';

export const metadata: Metadata = { title: '許可 IP' };

type Row = { id: string; cidr: string; label: string | null; created_at: string; created_by_name: string | null };

export default async function AllowedIpsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAdmin('super_admin');
  const sp = await searchParams;
  const q = sp.q?.trim().slice(0, 100) ?? '';
  const { rows: all } = await query<Row>(
    `SELECT i.id, i.cidr, i.label, i.created_at, a.display_name AS created_by_name
     FROM admin_allowed_ips i LEFT JOIN admin_users a ON a.id = i.created_by
     WHERE i.deleted_at IS NULL ORDER BY i.created_at`,
  );
  // 件数が少ないので絞り込みは取得後に行う。
  // IP アドレス (例: 152.165.122.145) を入れたときは、その IP を含む範囲も見つかるようにする
  const keyword = q.toLowerCase();
  const rows = all.filter(
    (r) =>
      !keyword ||
      r.cidr.includes(keyword) ||
      (r.label ?? '').toLowerCase().includes(keyword) ||
      (isIpv4(q) && cidrContains(r.cidr, q)),
  );

  return (
    <>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="page-title mb-0">許可 IP</h1>
        <AddIpButton />
      </div>

      <form className="card mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <label className="label" htmlFor="q">IP アドレス・メモ</label>
          <input className="input" id="q" name="q" defaultValue={q} placeholder="IP アドレスを入れると、その IP を含む範囲も表示します" />
        </div>
        <button className="btn">絞り込む</button>
        <Link className="btn-sub" href="/allowed-ips">クリア</Link>
      </form>

      <div className="card mb-4 overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>IP アドレス（CIDR）</th>
              <th>メモ</th>
              <th>登録日時</th>
              <th>登録者</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="font-mono">{r.cidr}</td>
                <td>{r.label ?? '—'}</td>
                <td className="whitespace-nowrap">{formatJst(r.created_at)}</td>
                <td>{r.created_by_name ?? '（初期設定）'}</td>
                <td className="w-28 text-right whitespace-nowrap">
                  <EditIpButton id={r.id} cidr={r.cidr} label={r.label} />
                  <DeleteIpButton id={r.id} cidr={r.cidr} label={r.label} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="py-8 text-center text-slate-500">該当する許可 IP はありません</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <ResyncButton />
    </>
  );
}
