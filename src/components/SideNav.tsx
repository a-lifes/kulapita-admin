'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { IconName, icons } from './icons';
import { UserMenu } from './UserMenu';

export type NavItem = { href: string; text: string; icon: IconName };
export type NavGroup = { title: string; items: NavItem[] };

/** 開閉状態は Cookie に覚えておき、次に開いたときも同じ状態で表示する */
export const NAV_COOKIE = 'kadm_nav';

/**
 * 左側のメニュー (microCMS の管理画面と同じ構成)
 *
 *   ┌────┬──────────────┐
 *   │ロゴ│ kulapita     │ ← ロゴと環境名
 *   │    │ グループ見出し │
 *   │    │  ≡ 項目       │ ← 今いる画面は紫で強調
 *   │    │  ≡ 項目       │
 *   │人  │              │ ← 左下: ログイン中のユーザー (メニュー)
 *   └────┴──────────────┘
 *    濃紺   薄いグレー (閉じるとアイコンだけ)
 */
export function SideNav({
  groups,
  initialCollapsed,
  stageLabel,
  stageColor,
  user,
}: {
  groups: NavGroup[];
  initialCollapsed: boolean;
  stageLabel: string;
  stageColor: string;
  user: { name: string; email: string; role: string };
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const pathname = usePathname();

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${NAV_COOKIE}=${next ? 'closed' : 'open'}; path=/; max-age=31536000; samesite=strict`;
  };
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));
  const Toggle = collapsed ? icons.expand : icons.collapse;

  return (
    <div className="sticky top-0 flex h-screen shrink-0">
      {/* 濃紺の細い列: ロゴ・開閉・ユーザー */}
      <div className="flex w-[72px] flex-col items-center bg-rail py-4">
        <Link
          href="/"
          aria-label="ダッシュボードへ"
          className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-white ring-2 ring-white/20"
        >
          <Image src="/mark.png" alt="" width={34} height={34} unoptimized />
        </Link>
        <button
          type="button"
          onClick={toggle}
          className="mt-6 rounded-md p-2 text-white/70 hover:bg-white/10 hover:text-white"
          aria-label={collapsed ? 'メニューを開く' : 'メニューを閉じる'}
          title={collapsed ? 'メニューを開く' : 'メニューを閉じる'}
        >
          <Toggle className="h-6 w-6" />
        </button>
        <div className="mt-auto">
          <UserMenu {...user} />
        </div>
      </div>

      {/* 薄いグレーの列: 環境名とメニュー */}
      <aside
        className={`flex flex-col overflow-y-auto overflow-x-hidden border-r border-slate-200 bg-nav transition-[width] duration-200 ${
          collapsed ? 'w-16' : 'w-60'
        }`}
      >
        <div className={`pt-5 pb-3 ${collapsed ? 'flex justify-center px-0' : 'px-5'}`}>
          {collapsed ? (
            <span className={`h-3 w-3 rounded-full ${stageColor}`} title={stageLabel} />
          ) : (
            <>
              <Image src="/logo.png" alt="kulapita" width={140} height={26} unoptimized priority />
              <p className="mt-2 flex items-center gap-1.5 text-sm text-nav-text">
                <span className={`h-2.5 w-2.5 rounded-full ${stageColor}`} />
                {stageLabel}
              </p>
            </>
          )}
        </div>

        <nav className="flex flex-col pb-6">
          {groups.map((group) => (
            <div key={group.title} className="mt-4">
              {collapsed ? (
                <hr className="mx-3 mb-2 border-slate-200" />
              ) : (
                <p className="mb-1.5 px-5 text-[13px] font-bold text-nav-heading">{group.title}</p>
              )}
              <div className="flex flex-col gap-0.5 px-2.5">
                {group.items.map((item) => {
                  const Icon = icons[item.icon];
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={collapsed ? item.text : undefined}
                      aria-label={item.text}
                      className={`flex items-center gap-3 rounded-md py-2.5 text-[15px] whitespace-nowrap ${
                        collapsed ? 'justify-center px-0' : 'px-3'
                      } ${
                        active
                          ? 'bg-nav-active font-bold text-brand'
                          : 'text-nav-text hover:bg-nav-active/60 hover:text-brand'
                      }`}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      {!collapsed && <span>{item.text}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>
    </div>
  );
}
