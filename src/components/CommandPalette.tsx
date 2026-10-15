'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { quickSearch, type QuickResult } from '@/app/(admin)/quickSearch';
import { openDetail } from './DetailDrawerHost';
import { icons } from './icons';
import type { NavGroup } from './SideNav';

/** サイドメニューの検索ボタンなどから開くときに window に送るイベント */
export const OPEN_PALETTE_EVENT = 'kadm:open-palette';

type Item = { kind: string; label: string; sub: string; href: string };

/**
 * ⌘K (Windows は Ctrl+K) で開く検索。メニューへの移動と、会員・お問い合わせ・申し込みの検索ができる。
 * ↑↓ で選び、Enter で開く。Esc で閉じる。
 */
export function CommandPalette({ groups }: { groups: NavGroup[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<QuickResult[]>([]);
  const [active, setActive] = useState(0);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, []);

  // 入力が止まってから 0.25 秒後に検索する
  useEffect(() => {
    if (!open) return;
    const text = q.trim();
    const t = setTimeout(() => {
      if (!text) {
        startTransition(() => setResults([]));
        return;
      }
      startTransition(async () => {
        const r = await quickSearch(text).catch(() => []);
        setResults(r);
        setActive(0);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [q, open]);

  const menu: Item[] = useMemo(() => {
    const text = q.trim().toLowerCase();
    return groups
      .flatMap((g) => g.items.map((i) => ({ kind: 'メニュー', label: i.text, sub: '', href: i.href })))
      .filter((i) => !text || i.label.toLowerCase().includes(text));
  }, [groups, q]);
  const items: Item[] = [...menu, ...(q.trim() ? results : [])];

  const close = () => {
    setOpen(false);
    setQ('');
    setResults([]);
    setActive(0);
  };
  const go = (item: Item | undefined) => {
    if (!item) return;
    close();
    // お問い合わせ・申し込みは、今の画面のまま右側のパネルで開く
    const m = item.href.match(/^\/(contacts|applications)\/([0-9a-f-]{36})$/);
    if (m) {
      openDetail({ kind: m[1] === 'contacts' ? 'contact' : 'application', id: m[2] });
      return;
    }
    router.push(item.href, { scroll: false });
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="検索">
      <button type="button" className="drawer-backdrop absolute inset-0 cursor-default bg-slate-900/30" aria-label="閉じる" onClick={close} />
      <div className="palette absolute top-[12vh] left-1/2 w-[min(520px,92vw)] -translate-x-1/2 overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center gap-3 border-b border-slate-100 px-4">
          <icons.search className="h-5 w-5 shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') close();
              else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, items.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                go(items[active]);
              }
            }}
            placeholder="会員番号・名前・受付番号・メール、またはメニュー名"
            className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-slate-400"
          />
          {pending && <span className="text-xs text-slate-400">検索中…</span>}
          <kbd className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-400">Esc</kbd>
        </div>
        <ul className="max-h-[52vh] overflow-y-auto p-2" role="listbox">
          {items.length === 0 && (
            <li className="px-3 py-8 text-center text-slate-400">{pending ? '検索しています…' : '見つかりませんでした'}</li>
          )}
          {items.map((item, i) => {
            const prev = items[i - 1];
            return (
              <li key={`${item.kind}-${item.href}`} role="option" aria-selected={i === active}>
                {(!prev || prev.kind !== item.kind) && (
                  <p className="px-3 pt-2 pb-1 text-[11px] font-medium text-slate-400">{item.kind}</p>
                )}
                <button
                  type="button"
                  onMouseMove={() => setActive(i)}
                  onClick={() => go(item)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${
                    i === active ? 'bg-brand-soft text-brand' : 'text-slate-700'
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.sub && <span className="max-w-[45%] truncate text-xs text-slate-400">{item.sub}</span>}
                  {i === active && <span className="text-xs text-slate-400">↵</span>}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex gap-4 border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400">
          <span>↑↓ で選ぶ</span>
          <span>Enter で開く</span>
          <span>Ctrl+K でいつでも開けます</span>
        </div>
      </div>
    </div>
  );
}
