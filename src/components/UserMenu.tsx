'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { logoutAction } from '@/app/(admin)/actions';
import { icons } from './icons';

/**
 * ヘッダー右のログイン中ユーザー。
 * マウスを乗せる (またはクリックする) と、メールアドレス・権限・パスワード変更・ログアウトを出す。
 */
export function UserMenu({ name, email, role }: { name: string; email: string; role: string }) {
  const [open, setOpen] = useState(false);
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
        className="flex items-center gap-2 rounded-full bg-white/80 py-1.5 pr-3 pl-1.5 text-sm font-bold text-slate-800 shadow-sm ring-1 ring-black/5 hover:bg-white"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-white">
          <icons.user className="h-4 w-4" />
        </span>
        {name}
        <icons.chevronDown className="h-4 w-4 text-slate-500" />
      </button>

      {open && (
        // 上の余白 (pt-2) もメニューの一部にして、ボタンから移る途中で閉じないようにする
        <div className="absolute right-0 top-full z-30 pt-2" role="menu">
          <div className="w-72 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
            <div className="border-b border-slate-100 px-4 py-3 text-sm">
              <p className="font-bold">{name}</p>
              <p className="mt-0.5 break-all text-slate-600">{email}</p>
              <span className="badge mt-2 bg-slate-100 text-slate-700">{role}</span>
            </div>
            <Link
              href="/account"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-slate-50"
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
