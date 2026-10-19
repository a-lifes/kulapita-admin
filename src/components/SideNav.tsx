'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { OPEN_PALETTE_EVENT } from './CommandPalette';
import { IconName, icons } from './icons';
import { HelpButton } from './PageHelp';
import { UserMenu } from './UserMenu';

export type NavItem = { href: string; text: string; icon: IconName };
export type NavGroup = { title: string; items: NavItem[] };

/** 開閉状態は Cookie に覚えておき、次に開いたときも同じ状態で表示する */
export const NAV_COOKIE = 'kadm_nav';

/**
 * 左側のメニュー (microCMS の管理画面に近い構成)
 *
 *   ┌───────────────────┐
 *   │● 環境 [?][本][🔍][⇤]│ ← 環境名・この画面の説明 (ある画面だけ)・操作マニュアル・検索・開閉ボタン
 *   │ kulapita (ロゴ)     │ ← 閉じると正方形のロゴ
 *   │ グループ見出し       │
 *   │  ≡ 項目            │ ← 今いる画面は紫で強調
 *   │ …                  │
 *   │(人) 管理者          │ ← 一番下: ログイン中のユーザー (メニュー)
 *   └───────────────────┘
 *   閉じるとアイコンだけになる
 */
export function SideNav({
  groups,
  initialCollapsed,
  initialDark,
  stageLabel,
  stageColor,
  user,
}: {
  groups: NavGroup[];
  initialCollapsed: boolean;
  initialDark: boolean;
  stageLabel: string;
  stageColor: string;
  user: { name: string; email: string; role: string };
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  // メニューにマウスを乗せたときのツールチップ (メニューの枠で切れないよう、画面に対する位置で出す)
  const [tip, setTip] = useState<{ text: string; top: number; left: number } | null>(null);
  const showTip = (text: string, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setTip({ text, top: r.top + r.height / 2, left: r.right + 8 });
  };
  const pathname = usePathname();

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${NAV_COOKIE}=${next ? 'closed' : 'open'}; path=/; max-age=31536000; samesite=strict`;
  };
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));
  const Toggle = collapsed ? icons.expand : icons.collapse;

  return (
    <aside
      className={`sticky top-0 z-40 flex h-screen shrink-0 flex-col border-r border-slate-200 bg-nav transition-[width] duration-200 ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* 一番上: 環境名と開閉ボタン */}
      <div
        className={`flex min-h-11 shrink-0 items-center border-b border-slate-200 bg-slate-100/80 ${
          collapsed ? 'flex-col justify-center py-1.5' : 'justify-between pr-2 pl-4'
        }`}
      >
        {!collapsed && (
          <span className="flex items-center gap-1.5 text-xs font-bold text-nav-heading">
            <span className={`h-2.5 w-2.5 rounded-full ${stageColor}`} />
            {stageLabel}
          </span>
        )}
        <div className={`flex items-center ${collapsed ? 'flex-col' : 'gap-0'}`}>
        {/* 画面の説明は、メニューを開いているときだけ出す */}
        {!collapsed && <HelpButton />}
        {/* 操作マニュアル (別タブで開く) */}
        {!collapsed && (
        <a
          href="/manual"
          target="_blank"
          rel="noopener"
          className="rounded-md p-1 text-nav-text hover:bg-nav-active hover:text-brand"
          aria-label="操作マニュアル（別タブで開く）"
          title="操作マニュアル"
        >
          <icons.book className="h-5 w-5" />
        </a>
        )}
        {/* 検索 (Ctrl+K と同じ)。メニューを閉じているときは開閉ボタンだけにする */}
        {!collapsed && (
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
          className="rounded-md p-1 text-nav-text hover:bg-nav-active hover:text-brand"
          aria-label="検索（Ctrl+K）"
          title="検索（Ctrl+K）"
        >
          <icons.search className="h-5 w-5" />
        </button>
        )}
        <button
          type="button"
          onClick={toggle}
          className="relative rounded-md p-1 text-nav-text hover:bg-nav-active hover:text-brand"
          aria-label={collapsed ? 'メニューを開く' : 'メニューを閉じる'}
          title={collapsed ? `メニューを開く（${stageLabel}）` : 'メニューを閉じる'}
        >
          <Toggle className="h-5 w-5" />
          {/* 閉じているときも環境が分かるよう、ボタンの右上に色の丸を出す */}
          {collapsed && <span className={`absolute top-0.5 right-0.5 h-2 w-2 rounded-full ${stageColor}`} />}
        </button>
        </div>
      </div>

      {/* ロゴ (閉じると正方形のロゴ) */}
      <Link
        href="/"
        aria-label="ダッシュボードへ"
        className={`flex shrink-0 items-center ${collapsed ? 'justify-center py-4' : 'px-5 pt-5 pb-2'}`}
      >
        {collapsed ? (
          <Image src="/mark.png" alt="kulapita" width={36} height={36} unoptimized priority />
        ) : (
          <Image src="/logo.png" alt="kulapita" width={150} height={28} unoptimized priority />
        )}
      </Link>

      {/* メニュー */}
      <nav className="flex-1 overflow-x-hidden overflow-y-auto pb-4">
        {groups.map((group) => (
          <div key={group.title} className="mt-4">
            {collapsed ? (
              <hr className="mx-3 mb-2 border-slate-200" />
            ) : (
              <p className="mb-1.5 px-5 text-[11px] font-bold text-nav-heading">{group.title}</p>
            )}
            <div className="flex flex-col gap-0.5 px-2.5">
              {group.items.map((item) => {
                const Icon = icons[item.icon];
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-label={item.text}
                    onMouseEnter={(e) => showTip(item.text, e.currentTarget)}
                    onMouseLeave={() => setTip(null)}
                    onFocus={(e) => showTip(item.text, e.currentTarget)}
                    onBlur={() => setTip(null)}
                    onClick={() => setTip(null)}
                    className={`relative flex items-center gap-3 rounded-lg py-2.5 text-[13px] whitespace-nowrap ${
                      collapsed ? 'justify-center px-0' : 'px-3'
                    } ${
                      active
                        ? 'bg-white font-semibold text-brand shadow-[0_1px_2px_rgba(15,23,42,0.06)]'
                        : 'text-nav-text hover:bg-white/60 hover:text-brand'
                    }`}
                  >
                    {/* 選んでいるメニューは左にブランド色の細い縦線 */}
                    {active && <span className="absolute top-2 bottom-2 -left-2.5 w-[3px] rounded-r-full bg-brand" aria-hidden="true" />}
                    <Icon className="h-5 w-5 shrink-0" />
                    {!collapsed && <span>{item.text}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {tip && (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-50 -translate-y-1/2 rounded-md bg-slate-800 px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap text-white shadow-lg"
          style={{ top: tip.top, left: tip.left }}
        >
          {tip.text}
        </div>
      )}

      {/* 一番下: ログイン中のユーザー */}
      <div className={`shrink-0 border-t border-slate-200 py-3 ${collapsed ? 'flex justify-center' : 'px-3'}`}>
        <UserMenu {...user} compact={collapsed} initialDark={initialDark} />
      </div>
    </aside>
  );
}
