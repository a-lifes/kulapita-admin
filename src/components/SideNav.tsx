'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { IconName, icons } from './icons';

export type NavItem = { href: string; text: string; icon: IconName };

/** 開閉状態は Cookie に覚えておき、次に開いたときも同じ状態で表示する */
export const NAV_COOKIE = 'kadm_nav';

/**
 * 左のサイドメニュー。開いているときは「アイコン + 文字」、閉じているときはアイコンだけ。
 * 閉じているときは、アイコンにマウスを乗せると項目名が出る。
 */
export function SideNav({ items, initialCollapsed }: { items: NavItem[]; initialCollapsed: boolean }) {
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
    <aside
      className={`sticky top-16 h-[calc(100vh-4rem)] shrink-0 overflow-y-auto overflow-x-hidden border-r border-slate-200 bg-white transition-[width] duration-200 ${
        collapsed ? 'w-16' : 'w-56'
      }`}
    >
      <div className={`flex px-2 pt-3 pb-1 ${collapsed ? 'justify-center' : 'justify-end'}`}>
        <button
          type="button"
          onClick={toggle}
          className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          aria-label={collapsed ? 'メニューを開く' : 'メニューを閉じる'}
          title={collapsed ? 'メニューを開く' : 'メニューを閉じる'}
        >
          <Toggle />
        </button>
      </div>
      <nav className="flex flex-col gap-0.5 px-2 pb-4 text-sm">
        {items.map((item) => {
          const Icon = icons[item.icon];
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.text : undefined}
              aria-label={item.text}
              className={`flex items-center gap-3 rounded-md py-2 whitespace-nowrap ${
                collapsed ? 'justify-center px-0' : 'px-3'
              } ${active ? 'bg-brand/10 font-bold text-brand' : 'text-slate-700 hover:bg-slate-100'}`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span>{item.text}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
