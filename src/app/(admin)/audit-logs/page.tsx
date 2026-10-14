import type { Metadata } from 'next';
import Link from 'next/link';
import { Pagination, PAGE_SIZE, pageFrom } from '@/components/Pagination';
import { requireAdmin } from '@/lib/auth/guard';
import { query } from '@/lib/db';
import { formatJst } from '@/lib/format';

export const metadata: Metadata = { title: '操作ログ' };

const ACTION_LABEL: Record<string, string> = {
  'auth.login': 'ログイン',
  'auth.login_failed': 'ログイン失敗',
  'auth.logout': 'ログアウト',
  'auth.password_change': 'パスワード変更',
  'auth.mfa_setup': '2 段階認証の登録',
  'contact.update': 'お問い合わせ更新',
  'export.contacts': 'CSV 出力（お問い合わせ）',
  'export.newsletter': 'CSV 出力（メルマガ）',
  'export.presents': 'CSV 出力（プレゼント）',
  'present.update_status': 'プレゼント結果の設定',
  'admin_user.create': '管理者の追加',
  'admin_user.update': '管理者の変更',
  'admin_user.reset_password': '仮パスワード再発行',
  'admin_user.delete': '管理者の削除',
  'admin_user.reset_mfa': '2 段階認証リセット',
  'allowed_ip.create': '許可 IP の追加',
  'allowed_ip.update': '許可 IP の変更',
  'allowed_ip.delete': '許可 IP の削除',
  'allowed_ip.sync': '許可 IP の WAF 再反映',
};

type Row = {
  id: string;
  admin_email_snapshot: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  diff: string | null;
  ip_address: string | null;
  created_at: string;
};

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAdmin('admin');
  const sp = await searchParams;
  const action = sp.action && ACTION_LABEL[sp.action] ? sp.action : undefined;
  const page = pageFrom(sp.page);
  const where = action ? 'WHERE action = :action' : '';
  const params = action ? { action } : {};

  const [{ rows }, { rows: count }] = await Promise.all([
    query<Row>(
      `SELECT id, admin_email_snapshot, action, target_type, target_id, diff, ip_address, created_at
       FROM admin_audit_logs ${where} ORDER BY created_at DESC, id DESC LIMIT :limit OFFSET :offset`,
      { ...params, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
    ),
    query<{ total: number }>(`SELECT COUNT(*) AS total FROM admin_audit_logs ${where}`, params),
  ]);

  return (
    <>
      <h1 className="page-title">操作ログ</h1>
      <form className="card mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="action">操作</label>
          <select className="input" id="action" name="action" defaultValue={action ?? ''}>
            <option value="">すべて</option>
            {Object.entries(ACTION_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <button className="btn">絞り込む</button>
        <Link className="btn-sub" href="/audit-logs">クリア</Link>
      </form>
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>日時</th>
              <th>操作した人</th>
              <th>操作</th>
              <th>対象</th>
              <th>内容</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap">{formatJst(r.created_at)}</td>
                <td className="break-all">{r.admin_email_snapshot ?? '—'}</td>
                <td className="whitespace-nowrap">{ACTION_LABEL[r.action] ?? r.action}</td>
                <td>
                  {r.target_type === 'contact' && r.target_id ? (
                    <Link className="text-brand underline" href={`/contacts/${r.target_id}`}>お問い合わせ</Link>
                  ) : (
                    r.target_type ?? '—'
                  )}
                </td>
                <td className="max-w-md break-all font-mono text-xs">{r.diff ?? ''}</td>
                <td className="font-mono text-xs">{r.ip_address ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination basePath="/audit-logs" params={{ action }} page={page} total={Number(count[0]?.total ?? 0)} />
    </>
  );
}
