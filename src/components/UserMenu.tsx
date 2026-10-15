'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { logoutAction } from '@/app/(admin)/actions';
import { icons } from './icons';

/** ダークモードを覚えておく Cookie */
export const THEME_COOKIE = 'kadm_theme';

/**
 * メニュー一番下のログイン中ユーザー。メニューを閉じているときはアイコンだけ (compact)。
 * マウスを乗せる (またはクリックする) と、名前・メールアドレス・権限・パスワード変更・ログアウトを出す。
 */
export function UserMenu({
  name,
  email,
  role,
  compact = false,
  initialDark = false,
}: {
  name: string;
  email: string;
  role: string;
  compact?: boolean;
  /** ダークモードか (Cookie kadm_theme。サーバーで読んで渡す) */
  initialDark?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(initialDark);
  // ダークモードの切り替え: 管理画面の一番外側の .dark を付け外しし、Cookie に覚える (次に開いたときも同じ表示)
  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.querySelector('[data-theme-root]')?.classList.toggle('dark', next);
    document.cookie = `${THEME_COOKIE}=${next ? 'dark' : 'light'}; path=/; max-age=31536000; samesite=lax`;
  };
  const ref = useRef<HTMLDivElement>(null);

  // メニューの外をクリック / Esc で閉じる
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${name} のメニュー`}
        title={name}
        className={`flex items-center gap-2.5 rounded-md text-left hover:bg-nav-active ${compact ? 'p-1' : 'w-full p-1.5'}`}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-400 text-[#fff]">
          <icons.user className="h-5 w-5" />
        </span>
        {!compact && (
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-slate-800">{name}</span>
            <span className="block truncate text-xs text-nav-text">{role}</span>
          </span>
        )}
      </button>

      {open && (
        // 左の余白 (pl-3) もメニューの一部にして、ボタンから移る途中で閉じないようにする
        <div className="absolute bottom-0 left-full z-30 pl-3" role="menu">
          <div className="w-72 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="border-b border-slate-100 px-4 py-3 text-sm">
              <p className="font-bold text-slate-900">{name}</p>
              <p className="mt-0.5 break-all text-slate-600">{email}</p>
              <span className="mt-2 inline-block rounded px-2 py-0.5 text-xs font-semibold bg-nav-active text-brand">{role}</span>
            </div>
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={dark}
              onClick={toggleTheme}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              <span className="h-4 w-4 text-center text-slate-500" aria-hidden="true">
                {dark ? '☀' : '☾'}
              </span>
              <span className="flex-1">ダークモード</span>
              {/* スイッチ */}
              <span className={`relative h-5 w-9 rounded-full transition-colors ${dark ? 'bg-brand' : 'bg-slate-300'}`} aria-hidden="true">
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-[#fff] shadow transition-[left] ${dark ? 'left-[18px]' : 'left-0.5'}`} />
              </span>
            </button>
            <Link
              href="/account"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              <icons.key className="h-4 w-4 text-slate-500" />
              パスワード変更
            </Link>
            <form action={logoutAction}>
              <button
                role="menuitem"
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-red-700 hover:bg-red-50"
              >
                <icons.logout className="h-4 w-4" />
                ログアウト
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
