'use client';

import { useSyncExternalStore } from 'react';
import { icons } from './icons';

/**
 * 開閉できるエリア (検索エリア・プレゼントの「景品ごとの当選状況」など)。
 * 閉じた状態はこのブラウザに覚えておき、次に開いたときも同じ状態にする (画面ごとに別々に覚える)。
 * 覚えておけないとき (プライベートブラウズなど) は、画面を開いている間だけ覚える。
 */
const PREFIX = 'kadm_collapsed:';
const EVENT = 'kadm:collapse';
const memory = new Map<string, boolean>();

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

function read(key: string): boolean {
  try {
    return localStorage.getItem(PREFIX + key) === '1';
  } catch {
    return memory.get(key) ?? false;
  }
}

/** [閉じているか, 閉じる・開く] */
export function useCollapsed(key: string): [boolean, (collapsed: boolean) => void] {
  const collapsed = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => false, // サーバーでは常に開いた状態で描く
  );
  const set = (value: boolean) => {
    memory.set(key, value);
    try {
      if (value) localStorage.setItem(PREFIX + key, '1');
      else localStorage.removeItem(PREFIX + key);
    } catch {
      // 覚えておけないときは memory だけ
    }
    window.dispatchEvent(new Event(EVENT));
  };
  return [collapsed, set];
}

/** 見出し + 開閉ボタン (押すと開く・閉じる) */
export function CollapseHeader({
  title,
  collapsed,
  onToggle,
  controls,
}: {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  /** 開閉する中身の id (aria-controls) */
  controls: string;
}) {
  return (
    <button
      type="button"
      className="-m-1 flex items-center gap-1.5 rounded-md p-1 text-sm font-bold text-slate-800 hover:text-brand"
      aria-expanded={!collapsed}
      aria-controls={controls}
      onClick={onToggle}
      title={collapsed ? '開く' : '閉じる'}
    >
      <icons.chevronDown className={`h-4 w-4 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
      {title}
    </button>
  );
}

/**
 * 開閉できるカード。actions (右上のボタンなど) は開いているときだけ表示する。
 *   <Collapsible storageKey="presents:summary" title="景品ごとの当選状況" actions={…}>…</Collapsible>
 */
export function Collapsible({
  storageKey,
  title,
  actions,
  className = 'card mb-4',
  children,
}: {
  storageKey: string;
  title: string;
  /** 見出しの右に出すボタンなど (閉じているときは出さない) */
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useCollapsed(storageKey);
  const id = `collapse-${storageKey.replace(/[^A-Za-z0-9_-]/g, '-')}`;
  return (
    <div className={className}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <CollapseHeader title={title} collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} controls={id} />
        {!collapsed && actions}
      </div>
      <div id={id} hidden={collapsed} className="mt-3">
        {children}
      </div>
    </div>
  );
}
