import { cookies } from 'next/headers';
import { CommandPalette } from '@/components/CommandPalette';
import { DetailDrawerHost } from '@/components/DetailDrawerHost';
import { THEME_COOKIE } from '@/components/UserMenu';
import { NAV_COOKIE, NavGroup, NavItem, SideNav } from '@/components/SideNav';
import { HelpProvider } from '@/components/PageHelp';
import { Toaster } from '@/components/Toaster';
import { hasRole, Role } from '@/lib/adminUsers';
import { requireAdmin } from '@/lib/auth/guard';
import { label, ROLE_LABEL } from '@/lib/format';
import { currentStage, STAGE_LABEL } from '@/lib/stage';

const NAV: { title: string; items: (NavItem & { min: Role })[] }[] = [
  {
    title: '受付・応募',
    items: [
      { href: '/', text: 'ダッシュボード', icon: 'dashboard', min: 'readonly' },
      { href: '/members', text: '会員', icon: 'members', min: 'readonly' },
      { href: '/contacts', text: 'お問い合わせ', icon: 'contacts', min: 'readonly' },
      { href: '/applications', text: 'コンバージョン（申し込み）', icon: 'applications', min: 'readonly' },
      { href: '/clicks', text: 'コンバージョン（誘導）', icon: 'clicks', min: 'readonly' },
      { href: '/newsletter', text: 'メルマガ', icon: 'newsletter', min: 'readonly' },
      { href: '/presents', text: 'プレゼント', icon: 'presents', min: 'readonly' },
      { href: '/pageviews', text: 'ページ別表示回数', icon: 'barChart', min: 'readonly' },
    ],
  },
  {
    title: '管理',
    items: [
      { href: '/audit-logs', text: '操作ログ', icon: 'auditLogs', min: 'admin' },
      { href: '/users', text: 'アカウント', icon: 'users', min: 'super_admin' },
      { href: '/allowed-ips', text: '許可 IP', icon: 'allowedIps', min: 'super_admin' },
    ],
  },
];

/** 環境名の前の丸の色 (本番以外はひと目で分かる色にする) */
const STAGE_COLOR = { prod: 'bg-emerald-500', dev: 'bg-sky-500', local: 'bg-amber-500' } as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const stage = currentStage();
  const cookieStore = await cookies();
  const collapsed = cookieStore.get(NAV_COOKIE)?.value === 'closed';
  const dark = cookieStore.get(THEME_COOKIE)?.value === 'dark';
  const groups: NavGroup[] = NAV.map((g) => ({
    title: g.title,
    items: g.items.filter((i) => hasRole(admin.role, i.min)).map(({ href, text, icon }) => ({ href, text, icon })),
  })).filter((g) => g.items.length > 0);

  return (
    <HelpProvider>
    {/* ダークモードは一番外側の .dark で切り替える (ログイン画面には影響しない) */}
    <div data-theme-root className={`${dark ? 'dark ' : ''}flex min-h-screen bg-canvas text-slate-800`}>
      <SideNav
        groups={groups}
        initialCollapsed={collapsed}
        initialDark={dark}
        stageLabel={STAGE_LABEL[stage]}
        stageColor={STAGE_COLOR[stage]}
        user={{ name: admin.display_name, email: admin.email, role: label(ROLE_LABEL, admin.role) }}
      />
      {/* 画面の高さに固定し、はみ出す分はこの中でスクロールする (一覧画面は表の中だけスクロール) */}
      <main className="h-screen min-w-0 flex-1 overflow-y-auto px-8 py-6">{children}</main>
      {/* 一覧から開いた詳細 (右側のパネル) */}
      <DetailDrawerHost />
      <CommandPalette groups={groups} />
      <Toaster />
    </div>
    </HelpProvider>
  );
}
