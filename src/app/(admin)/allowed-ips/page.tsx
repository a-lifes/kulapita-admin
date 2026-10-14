import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth/guard';
import { query } from '@/lib/db';
import { formatJst } from '@/lib/format';
import { AddIpForm, DeleteIpButton, EditIpButton, ResyncButton } from './IpForms';

export const metadata: Metadata = { title: '許可 IP' };

type Row = { id: string; cidr: string; label: string | null; created_at: string; created_by_name: string | null };

export default async function AllowedIpsPage() {
  await requireAdmin('super_admin');
  const { rows } = await query<Row>(
    `SELECT i.id, i.cidr, i.label, i.created_at, a.display_name AS created_by_name
     FROM admin_allowed_ips i LEFT JOIN admin_users a ON a.id = i.created_by
     WHERE i.deleted_at IS NULL ORDER BY i.created_at`,
  );

  return (
    <>
      <h1 className="page-title">許可 IP</h1>
      <section className="card mb-6">
        <h2 className="mb-3 font-bold">追加</h2>
        <AddIpForm />
      </section>
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
          </tbody>
        </table>
      </div>
      <ResyncButton />
    </>
  );
}
