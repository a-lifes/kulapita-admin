'use client';

import { useEffect, useState } from 'react';
import { icons } from './icons';

/**
 * 画面下に一時的に出す通知 (スナックバー)。一覧の行の操作結果など、その場に置き場所が無いメッセージに使う。
 *
 *   import { toast } from '@/components/Toaster';
 *   toast.error('削除できませんでした');
 *   toast.success('削除しました');
 *
 * <Toaster /> は管理画面の共通レイアウトに 1 つだけ置く。
 */
type Kind = 'success' | 'error' | 'warning';
type Item = { id: number; kind: Kind; message: string };
const EVENT = 'kadm:toast';
let seq = 0;

function emit(kind: Kind, message: string) {
  window.dispatchEvent(new CustomEvent<Item>(EVENT, { detail: { id: ++seq, kind, message } }));
}

export const toast = {
  success: (message: string) => emit('success', message),
  error: (message: string) => emit('error', message),
  warning: (message: string) => emit('warning', message),
};

const STYLE: Record<Kind, string> = {
  success: 'bg-[#1d1f2b] text-[#fff]',
  error: 'bg-red-600 text-[#fff]',
  warning: 'bg-amber-500 text-[#fff]',
};

export function Toaster() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const item = (e as CustomEvent<Item>).detail;
      setItems((list) => [...list.slice(-3), item]);
      // 成功は 4 秒、エラー・注意は読む時間を考えて 8 秒で消す
      setTimeout(() => setItems((list) => list.filter((i) => i.id !== item.id)), item.kind === 'success' ? 4000 : 8000);
    };
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
      {items.map((item) => (
        <div
          key={item.id}
          role={item.kind === 'success' ? 'status' : 'alert'}
          className={`pointer-events-auto flex max-w-xl items-start gap-3 rounded-lg px-4 py-3 text-sm shadow-lg ${STYLE[item.kind]}`}
        >
          {item.kind !== 'success' && <icons.warning className="mt-0.5 h-4 w-4 shrink-0" />}
          <p className="leading-relaxed">{item.message}</p>
          <button
            type="button"
            aria-label="閉じる"
            className="-mr-1 ml-2 rounded p-0.5 opacity-80 hover:opacity-100"
            onClick={() => setItems((list) => list.filter((i) => i.id !== item.id))}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
