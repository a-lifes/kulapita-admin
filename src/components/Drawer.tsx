'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * 画面の右からスライドして出るパネル (一覧の行を押したときの詳細)。
 * 背景・× ボタン・Esc キーで閉じると、一覧に戻る (ブラウザの戻ると同じ)。
 */
export function Drawer({ label, children }: { label: string; children: React.ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') router.back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);

  return (
    <div className="fixed inset-0 z-[45]" role="dialog" aria-modal="true" aria-label={label}>
      <button
        type="button"
        className="drawer-backdrop absolute inset-0 cursor-default bg-slate-900/25"
        aria-label="閉じる"
        onClick={() => router.back()}
      />
      <aside className="drawer-panel absolute inset-y-0 right-0 flex w-[min(720px,96vw)] flex-col bg-canvas shadow-2xl">
        <button
          type="button"
          onClick={() => router.back()}
          className="absolute top-5 right-5 z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200/70 hover:text-slate-800"
          aria-label="閉じる"
          title="閉じる（Esc）"
        >
          ×
        </button>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">{children}</div>
      </aside>
    </div>
  );
}
