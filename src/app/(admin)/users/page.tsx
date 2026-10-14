import { listAdmins } from '@/lib/adminUsers';
import { requireAdmin } from '@/lib/auth/guard';
import { formatJst, label, ROLE_LABEL } from '@/lib/format';
import { CreateAdminForm, EditAdminForm } from './UserForms';

export default async function UsersPage() {
  const me = await requireAdmin('super_admin');
  const users = await listAdmins();

  return (
    <>
      <h1 className="page-title">管理者アカウント</h1>
      <section className="card mb-6">
        <h2 className="mb-3 font-bold">アカウントを追加</h2>
        <CreateAdminForm />
      </section>

      <section className="card mb-6 text-sm">
        <h2 className="mb-2 font-bold">権限の違い</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>スーパー管理者</strong>：すべての操作 + 管理者アカウント・許可 IP の管理</li>
          <li><strong>管理者</strong>：一覧の閲覧・お問い合わせの対応・CSV ダウンロード・操作ログの閲覧</li>
          <li><strong>担当者</strong>：一覧の閲覧・お問い合わせの対応（CSV ダウンロードは不可）</li>
          <li><strong>閲覧のみ</strong>：一覧の閲覧だけ</li>
        </ul>
      </section>

      <div className="space-y-4">
        {users.map((u) => (
          <section key={u.id} className="card">
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="text-base font-bold">{u.display_name}</span>
              <span className="break-all">{u.email}</span>
              <span className="badge bg-slate-100">{label(ROLE_LABEL, u.role)}</span>
              {!u.is_active && <span className="badge bg-slate-300">停止中</span>}
              {u.locked && <span className="badge bg-red-100 text-red-800">ロック中</span>}
              {u.must_change_password && <span className="badge bg-amber-100 text-amber-800">初回ログイン待ち</span>}
              <span className="text-slate-500">最終ログイン: {formatJst(u.last_login_at) || 'なし'}</span>
            </div>
            <EditAdminForm user={u} isSelf={u.id === me.id} />
          </section>
        ))}
      </div>
    </>
  );
}
