import type { Metadata } from 'next';
import Link from 'next/link';
import { Pagination, PAGE_SIZE, pageFrom } from '@/components/Pagination';
import { requireAdmin } from '@/lib/auth/guard';
import { likeEscape, Params, query } from '@/lib/db';
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
  'admin_user.create': 'アカウントの追加',
  'admin_user.update': 'アカウントの変更',
  'admin_user.reset_password': '仮パスワード再発行',
  'admin_user.delete': 'アカウントの削除',
  'admin_user.reset_mfa': '2 段階認証リセット',
  'allowed_ip.create': '許可 IP の追加',
  'allowed_ip.update': '許可 IP の変更',
  'allowed_ip.delete': '許可 IP の削除',
  'allowed_ip.sync': '許可 IP の WAF 再反映',
};

const TARGET_LABEL: Record<string, string> = {
  contact: 'お問い合わせ',
  admin_user: 'アカウント',
  allowed_ip: '許可 IP',
  present_application: 'プレゼント応募',
};

type Row = {
  id: string;
  account_name: string | null;
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
  const q = sp.q?.trim().slice(0, 100) || undefined;
  const page = pageFrom(sp.page);

  const conds: string[] = [];
  const params: Params = {};
  if (action) {
    conds.push('l.action = :action');
    params.action = action;
  }
  if (q) {
    // 操作アカウントの名前・メールアドレス (ログイン失敗など、アカウントが無いものは入力されたメールアドレス)
    conds.push('(a.display_name LIKE :q OR a.email LIKE :q OR l.admin_email_snapshot LIKE :q)');
    params.q = `%${likeEscape(q)}%`;
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const from = 'FROM admin_audit_logs l LEFT JOIN admin_users a ON a.id = l.admin_user_id';

  const [{ rows }, { rows: count }] = await Promise.all([
    query<Row>(
      `SELECT l.id, a.display_name AS account_name, l.admin_email_snapshot, l.action, l.target_type, l.target_id,
              l.diff, l.ip_address, l.created_at
       ${from} ${where} ORDER BY l.created_at DESC, l.id DESC LIMIT :limit OFFSET :offset`,
      { ...params, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
    ),
    query<{ total: number }>(`SELECT COUNT(*) AS total ${from} ${where}`, params),
  ]);

  return (
    <>
      <h1 className="page-title">操作ログ</h1>
      <form className="card mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <label className="label" htmlFor="q">操作アカウント</label>
          <input className="input" id="q" name="q" defaultValue={q ?? ''} placeholder="アカウント名またはメールアドレスの一部を入力" />
        </div>
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
              <th>操作アカウント</th>
              <th>操作</th>
              <th>対象</th>
              <th>内容</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{formatJst(r.created_at)}</td>
                {/* アカウントが無い操作 (存在しないアドレスでのログイン失敗など) は、入力されたメールアドレスを出す */}
                <td title={r.admin_email_snapshot ?? undefined}>{r.account_name ?? r.admin_email_snapshot ?? '—'}</td>
                <td>{ACTION_LABEL[r.action] ?? r.action}</td>
                <td>
                  {r.target_type === 'contact' && r.target_id ? (
                    <Link className="text-brand underline" href={`/contacts/${r.target_id}`}>お問い合わせ</Link>
                  ) : r.target_type ? (
                    (TARGET_LABEL[r.target_type] ?? r.target_type)
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  {/* 長い内容は省略し、マウスを乗せると全文を出す */}
                  <div className="max-w-md truncate" title={r.diff ?? undefined}>{r.diff ?? ''}</div>
                </td>
                <td>{r.ip_address ?? ''}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="py-8 text-center text-slate-500">該当する操作ログはありません</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination basePath="/audit-logs" params={{ q, action }} page={page} total={Number(count[0]?.total ?? 0)} />
    </>
  );
}
