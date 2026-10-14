import type { Metadata } from 'next';
import { PageHelp } from '@/components/PageHelp';
import { listAdmins } from '@/lib/adminUsers';
import { requireAdmin } from '@/lib/auth/guard';
import { formatJst, label, ROLE_LABEL } from '@/lib/format';
import { CreateAdminForm, EditAdminButton, ResetPasswordButton } from './UserForms';

export const metadata: Metadata = { title: 'アカウント' };

export default async function UsersPage() {
  const me = await requireAdmin('super_admin');
  const users = await listAdmins();

  return (
    <>
      <h1 className="page-title">アカウント</h1>
      <section className="card mb-6">
        <h2 className="mb-3 font-bold">アカウントを追加</h2>
        <CreateAdminForm />
      </section>

      <PageHelp title="権限の違い">
        <ul className="list-disc space-y-1.5 pl-5">
          <li><strong>スーパー管理者</strong>：すべての操作 + アカウント・許可 IP の管理</li>
          <li><strong>管理者</strong>：一覧の閲覧・お問い合わせの対応・CSV ダウンロード・操作ログの閲覧</li>
          <li><strong>担当者</strong>：一覧の閲覧・お問い合わせの対応（CSV ダウンロードは不可）</li>
          <li><strong>閲覧のみ</strong>：一覧の閲覧だけ</li>
        </ul>
      </PageHelp>

      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>表示名</th>
              <th>メールアドレス</th>
              <th>権限</th>
              <th>状態</th>
              <th>最終ログイン</th>
              <th>登録日時</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.is_active ? '' : 'text-slate-400'}>
                <td className="font-semibold">
                  {u.display_name}
                  {u.id === me.id && <span className="ml-2 text-xs font-normal text-slate-500">（自分）</span>}
                </td>
                <td className="break-all">{u.email}</td>
                <td className="whitespace-nowrap">{label(ROLE_LABEL, u.role)}</td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {u.is_active ? (
                      <span className="badge bg-emerald-100 text-emerald-800">有効</span>
                    ) : (
                      <span className="badge bg-slate-200 text-slate-600">停止中</span>
                    )}
                    {u.locked && <span className="badge bg-red-100 text-red-800">ロック中</span>}
                    {u.must_change_password && <span className="badge bg-amber-100 text-amber-800">初回ログイン待ち</span>}
                  </div>
                </td>
                <td className="whitespace-nowrap">{formatJst(u.last_login_at) || '—'}</td>
                <td className="whitespace-nowrap">{formatJst(u.created_at)}</td>
                <td className="w-28 text-right whitespace-nowrap">
                  <EditAdminButton user={u} isSelf={u.id === me.id} />
                  <ResetPasswordButton user={u} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
