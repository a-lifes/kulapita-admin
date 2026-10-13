import { requireAdmin } from '@/lib/auth/guard';
import { query } from '@/lib/db';
import { formatJst } from '@/lib/format';
import { requestMeta } from '@/lib/request';
import { AddIpForm, DeleteIpButton, ResyncButton } from './IpForms';

type Row = { id: string; cidr: string; label: string | null; created_at: string; created_by_name: string | null };

export default async function AllowedIpsPage() {
  await requireAdmin('super_admin');
  const { ip } = await requestMeta();
  const { rows } = await query<Row>(
    `SELECT i.id, i.cidr, i.label, i.created_at, a.display_name AS created_by_name
     FROM admin_allowed_ips i LEFT JOIN admin_users a ON a.id = i.created_by
     WHERE i.deleted_at IS NULL ORDER BY i.created_at`,
  );

  return (
    <>
      <h1 className="page-title">許可 IP</h1>
      <p className="mb-4 text-sm text-slate-600">
        ここに登録した IP からだけ管理画面に入れます。変更すると WAF (入口の防御) にも自動で反映します。
        最後の 1 件と、今お使いの IP を許可している範囲は削除できません。
      </p>
      <section className="card mb-6">
        <h2 className="mb-3 font-bold">追加</h2>
        <AddIpForm currentIp={ip} />
      </section>
      <div className="card mb-4 overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>CIDR</th>
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
                <td>{r.created_by_name ?? '(初期設定)'}</td>
                <td><DeleteIpButton id={r.id} cidr={r.cidr} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ResyncButton />
    </>
  );
}
