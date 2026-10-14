'use client';

import { useRouter } from 'next/navigation';
import { createContext, useContext, useState, useTransition } from 'react';
import { useConfirm } from '@/components/ConfirmDialog';
import { toast } from '@/components/Toaster';
import { PRESENT_STATUS_LABEL } from '@/lib/format';
import { setPresentStatusBulkAction } from './actions';

/**
 * プレゼント一覧の一括操作。行のチェックボックスで選び、上のバーで結果をまとめて設定する。
 *   <PresentBulkProvider ids={…}>
 *     <PresentBulkBar />
 *     … <SelectAllCheckbox /> … <RowCheckbox id={…} /> …
 *   </PresentBulkProvider>
 */
type Ctx = {
  ids: string[];
  selected: Set<string>;
  toggle: (id: string, on: boolean) => void;
  setAll: (on: boolean) => void;
  clear: () => void;
};

const BulkContext = createContext<Ctx | null>(null);

function useBulk(): Ctx {
  const ctx = useContext(BulkContext);
  if (!ctx) throw new Error('PresentBulkProvider の中で使ってください');
  return ctx;
}

export function PresentBulkProvider({ ids, children }: { ids: string[]; children: React.ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // 表示中の行に無いものは選択から外す (ページ移動・絞り込みのあと)
  const visible = new Set(ids);
  const current = new Set([...selected].filter((id) => visible.has(id)));
  const value: Ctx = {
    ids,
    selected: current,
    toggle: (id, on) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (on) next.add(id);
        else next.delete(id);
        return next;
      }),
    setAll: (on) => setSelected(on ? new Set(ids) : new Set()),
    clear: () => setSelected(new Set()),
  };
  return <BulkContext.Provider value={value}>{children}</BulkContext.Provider>;
}

export function SelectAllCheckbox() {
  const { ids, selected, setAll } = useBulk();
  const all = ids.length > 0 && selected.size === ids.length;
  return (
    <input
      type="checkbox"
      className="h-4 w-4 cursor-pointer accent-brand align-middle"
      aria-label="表示中の応募をすべて選ぶ"
      checked={all}
      ref={(el) => {
        if (el) el.indeterminate = selected.size > 0 && !all;
      }}
      disabled={ids.length === 0}
      onChange={(e) => setAll(e.target.checked)}
    />
  );
}

export function RowCheckbox({ id }: { id: string }) {
  const { selected, toggle } = useBulk();
  return (
    <input
      type="checkbox"
      className="h-4 w-4 cursor-pointer accent-brand align-middle"
      aria-label="この応募を選ぶ"
      checked={selected.has(id)}
      onChange={(e) => toggle(id, e.target.checked)}
    />
  );
}

export function PresentBulkBar() {
  const { selected, clear } = useBulk();
  const [status, setStatus] = useState('won');
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const count = selected.size;

  const apply = async () => {
    const ok = await confirm({
      title: '結果をまとめて設定',
      message: `選択中の ${count} 件を「${PRESENT_STATUS_LABEL[status]}」にします。よろしいですか？`,
      confirmLabel: '設定する',
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await setPresentStatusBulkAction([...selected], status);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        res.updated > 0
          ? `${res.updated} 件を「${PRESENT_STATUS_LABEL[status]}」にしました`
          : 'すでに同じ結果のため、変更はありませんでした',
      );
      clear();
      router.refresh();
    });
  };

  return (
    <div className="mb-2 flex min-h-9 flex-wrap items-center gap-3">
      {confirmDialog}
      <span className={count > 0 ? 'font-semibold text-brand' : 'text-slate-500'}>
        {count > 0 ? `${count} 件を選択中` : 'チェックした応募の結果をまとめて設定できます'}
      </span>
      <select
        className="rounded-md border border-slate-300 bg-white py-1 pr-8 pl-2.5 [background-position:right_0.5rem_center]"
        value={status}
        aria-label="設定する結果"
        disabled={count === 0 || pending}
        onChange={(e) => setStatus(e.target.value)}
      >
        {Object.entries(PRESENT_STATUS_LABEL).map(([k, v]) => (
          <option key={k} value={k}>{v}</option>
        ))}
      </select>
      <button type="button" className="btn py-1" disabled={count === 0 || pending} onClick={apply}>
        {pending ? '設定中…' : 'まとめて設定'}
      </button>
      {count > 0 && (
        <button type="button" className="text-slate-500 underline hover:text-slate-700" onClick={clear} disabled={pending}>
          選択を解除
        </button>
      )}
    </div>
  );
}
