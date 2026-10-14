'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { logoutAction } from '@/app/(admin)/actions';
import { icons } from './icons';

/**
 * 左下のログイン中ユーザー (microCMS と同じ位置)。
 * マウスを乗せる (またはクリックする) と、名前・メールアドレス・権限・パスワード変更・ログアウトを出す。
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
        aria-label={`${name} のメニュー`}
        title={name}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-400 text-white hover:bg-slate-300"
      >
        <icons.user className="h-6 w-6" />
      </button>

      {open && (
        // 左の余白 (pl-3) もメニューの一部にして、ボタンから移る途中で閉じないようにする
        <div className="absolute bottom-0 left-full z-30 pl-3" role="menu">
          <div className="w-72 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="border-b border-slate-100 px-4 py-3 text-sm">
              <p className="font-bold text-slate-900">{name}</p>
              <p className="mt-0.5 break-all text-slate-600">{email}</p>
              <span className="badge mt-2 bg-nav-active text-brand">{role}</span>
            </div>
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
