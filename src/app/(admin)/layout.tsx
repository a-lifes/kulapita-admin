import { cookies } from 'next/headers';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { NAV_COOKIE, NavItem, SideNav } from '@/components/SideNav';
import { UserMenu } from '@/components/UserMenu';
import { hasRole, Role } from '@/lib/adminUsers';
import { requireAdmin } from '@/lib/auth/guard';
import { label, ROLE_LABEL } from '@/lib/format';
import { currentStage, STAGE_LABEL } from '@/lib/stage';

const NAV: (NavItem & { min: Role })[] = [
  { href: '/', text: 'ダッシュボード', icon: 'dashboard', min: 'readonly' },
  { href: '/contacts', text: 'お問い合わせ', icon: 'contacts', min: 'readonly' },
  { href: '/newsletter', text: 'メルマガ登録者', icon: 'newsletter', min: 'readonly' },
  { href: '/presents', text: 'プレゼント応募', icon: 'presents', min: 'readonly' },
  { href: '/audit-logs', text: '操作ログ', icon: 'auditLogs', min: 'admin' },
  { href: '/users', text: '管理者アカウント', icon: 'users', min: 'super_admin' },
  { href: '/allowed-ips', text: '許可 IP', icon: 'allowedIps', min: 'super_admin' },
];

/** 本番以外はヘッダーの色を変え、どの環境を触っているか一目で分かるようにする */
const HEADER_STYLE = {
  prod: 'bg-white border-slate-200',
  dev: 'bg-sky-100 border-sky-300',
  local: 'bg-amber-100 border-amber-300',
} as const;
const STAGE_BADGE = {
  prod: '',
  dev: 'bg-sky-600 text-white',
  local: 'bg-amber-500 text-white',
} as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const stage = currentStage();
  const collapsed = (await cookies()).get(NAV_COOKIE)?.value === 'closed';
  const items = NAV.filter((n) => hasRole(admin.role, n.min)).map(({ href, text, icon }) => ({ href, text, icon }));

  return (
    <>
      <header className={`sticky top-0 z-20 flex h-16 items-center justify-between border-b px-5 ${HEADER_STYLE[stage]}`}>
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-end gap-2" aria-label="ダッシュボードへ">
            <Logo width={150} />
            <span className="pb-0.5 text-xs font-bold tracking-wider text-slate-600">管理画面</span>
          </Link>
          {stage !== 'prod' && (
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${STAGE_BADGE[stage]}`}>
              {STAGE_LABEL[stage]}
            </span>
          )}
        </div>
        <UserMenu name={admin.display_name} email={admin.email} role={label(ROLE_LABEL, admin.role)} />
      </header>
      <div className="flex">
        <SideNav items={items} initialCollapsed={collapsed} />
        <main className="min-w-0 flex-1 px-8 py-6">{children}</main>
      </div>
    </>
  );
}
