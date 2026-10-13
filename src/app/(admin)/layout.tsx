import Link from 'next/link';
import { hasRole, Role } from '@/lib/adminUsers';
import { requireAdmin } from '@/lib/auth/guard';
import { label, ROLE_LABEL } from '@/lib/format';
import { logoutAction } from './actions';

const NAV: { href: string; text: string; min: Role }[] = [
  { href: '/', text: 'ダッシュボード', min: 'readonly' },
  { href: '/contacts', text: 'お問い合わせ', min: 'readonly' },
  { href: '/newsletter', text: 'メルマガ登録者', min: 'readonly' },
  { href: '/presents', text: 'プレゼント応募', min: 'readonly' },
  { href: '/audit-logs', text: '操作ログ', min: 'admin' },
  { href: '/users', text: '管理者アカウント', min: 'super_admin' },
  { href: '/allowed-ips', text: '許可 IP', min: 'super_admin' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-slate-200 bg-white">
        <div className="px-5 py-4">
          <Link href="/" className="text-base font-bold text-brand">kulapita 管理画面</Link>
        </div>
        <nav className="flex flex-col px-2 text-sm">
          {NAV.filter((n) => hasRole(admin.role, n.min)).map((n) => (
            <Link key={n.href} href={n.href} className="rounded px-3 py-2 hover:bg-slate-100">
              {n.text}
            </Link>
          ))}
        </nav>
        <div className="mt-6 border-t border-slate-200 px-5 py-4 text-xs text-slate-600">
          <p className="font-semibold">{admin.display_name}</p>
          <p className="break-all">{admin.email}</p>
          <p className="mt-1">{label(ROLE_LABEL, admin.role)}</p>
          <div className="mt-3 flex gap-3">
            <Link href="/account" className="underline">パスワード変更</Link>
            <form action={logoutAction}>
              <button className="underline">ログアウト</button>
            </form>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-8 py-6">{children}</main>
    </div>
  );
}
