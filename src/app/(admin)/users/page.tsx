import type { Metadata } from 'next';
import { Pagination, pageFrom, perPageFrom } from '@/components/Pagination';
import { PageHelp } from '@/components/PageHelp';
import { listAdmins, Role, ROLES } from '@/lib/adminUsers';
import { requireAdmin } from '@/lib/auth/guard';
import { formatJst, label, ROLE_LABEL } from '@/lib/format';
import { CreateAdminButton, DeleteAdminButton, EditAdminButton, ResetPasswordButton } from './UserForms';
import { ClearButton, SearchButton, SearchForm } from '@/components/SearchForm';

export const metadata: Metadata = { title: 'アカウント' };

const STATUSES = { active: '有効', inactive: '停止中', locked: 'ロック中', pending: '初回ログイン待ち' } as const;

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const me = await requireAdmin('super_admin');
  const sp = await searchParams;
  const q = sp.q?.trim().toLowerCase().slice(0, 100) ?? '';
  const role = ROLES.includes(sp.role as Role) ? (sp.role as Role) : '';
  const status = sp.status && sp.status in STATUSES ? (sp.status as keyof typeof STATUSES) : '';
  const all = await listAdmins();
  // アカウントは多くても数十件なので、絞り込みは取得後に行う
  const page = pageFrom(sp.page);
  const perPage = perPageFrom(sp.per);
  const filtered = all.filter(
    (u) =>
      (!q || u.display_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) &&
      (!role || u.role === role) &&
      (!status ||
        (status === 'active' && u.is_active) ||
        (status === 'inactive' && !u.is_active) ||
        (status === 'locked' && u.locked) ||
        (status === 'pending' && u.must_change_password)),
  );
  const users = filtered.slice((page - 1) * perPage, page * perPage);

  return (
    <div className="list-page">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="page-title mb-0">アカウント</h1>
        <CreateAdminButton />
      </div>

      <SearchForm className="card mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <label className="label" htmlFor="q">表示名・メールアドレス</label>
          <input className="input" id="q" name="q" defaultValue={sp.q ?? ''} placeholder="表示名またはメールアドレスの一部を入力" />
        </div>
        <div>
          <label className="label" htmlFor="role">権限</label>
          <select className="input" id="role" name="role" defaultValue={role}>
            <option value="">すべて</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="status">状態</label>
          <select className="input" id="status" name="status" defaultValue={status}>
            <option value="">すべて</option>
            {Object.entries(STATUSES).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <SearchButton />
        <ClearButton href="/users" />
      </SearchForm>

      <PageHelp title="権限の違い">
        <ul className="list-disc space-y-1.5 pl-5">
          <li><strong>上級管理者</strong>：すべての操作 + アカウント・許可 IP の管理</li>
          <li><strong>管理者</strong>：一覧の閲覧・お問い合わせの対応・CSV ダウンロード・操作ログの閲覧</li>
          <li><strong>一般</strong>：一覧の閲覧・お問い合わせの対応（CSV ダウンロードは不可）</li>
          <li><strong>閲覧のみ</strong>：一覧の閲覧だけ</li>
        </ul>
      </PageHelp>

      <div className="card table-scroll">
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
                <td>
                  {u.display_name}
                  {u.id === me.id && <span className="ml-2 text-xs font-normal text-slate-500">（自分）</span>}
                </td>
                <td>{u.email}</td>
                <td>{label(ROLE_LABEL, u.role)}</td>
                <td>
                  <div className="flex gap-1">
                    {u.is_active ? (
                      <span className="badge bg-emerald-100 text-emerald-800">有効</span>
                    ) : (
                      <span className="badge bg-slate-200 text-slate-600">停止中</span>
                    )}
                    {u.locked && <span className="badge bg-red-100 text-red-800">ロック中</span>}
                    {u.must_change_password && <span className="badge bg-amber-100 text-amber-800">初回ログイン待ち</span>}
                  </div>
                </td>
                <td>{formatJst(u.last_login_at) || '—'}</td>
                <td>{formatJst(u.created_at)}</td>
                <td className="w-36 text-right whitespace-nowrap">
                  <EditAdminButton user={u} isSelf={u.id === me.id} />
                  <ResetPasswordButton user={u} />
                  <DeleteAdminButton user={u} isSelf={u.id === me.id} />
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-slate-500">{q || role || status ? '検索内容に一致するデータはありません。' : 'アカウントは登録されていません。'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination basePath="/users" params={{ q: sp.q, role, status }} page={page} perPage={perPage} total={filtered.length} />
    </div>
  );
}
