'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { icons } from './icons';

/**
 * 確認ダイアログ (ブラウザ標準の confirm の代わり)。画面中央に出し、背景を暗くする。
 *
 *   const [confirm, dialog] = useConfirm();
 *   if (!(await confirm({ title: '削除しますか？', message: '…', confirmLabel: '削除する', danger: true }))) return;
 *   …
 *   return <>{dialog}…</>;
 */
export type ConfirmOptions = {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 削除など取り消せない操作は赤いボタンにする */
  danger?: boolean;
};

export function useConfirm(): [(options: ConfirmOptions) => Promise<boolean>, React.ReactNode] {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    setOptions(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOptions(null);
  };

  return [confirm, options ? <ConfirmDialog options={options} onClose={close} /> : null];
}

function ConfirmDialog({ options, onClose }: { options: ConfirmOptions; onClose: (ok: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    ref.current?.showModal();
    // 取り消せない操作の誤実行を防ぐため、最初は「キャンセル」にフォーカスを置く
    cancelRef.current?.focus();
  }, []);

  return (
    <dialog
      ref={ref}
      // Esc キーで閉じたとき
      onCancel={(e) => {
        e.preventDefault();
        onClose(false);
      }}
      // 枠の外 (暗い背景) を押したとき
      onClick={(e) => {
        if (e.target === ref.current) onClose(false);
      }}
      className="m-auto w-[min(440px,92vw)] rounded-xl p-0 text-left font-normal whitespace-normal break-words shadow-2xl backdrop:bg-slate-900/50"
    >
      <div className="p-6">
        <div className="flex gap-4">
          {options.danger && (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
              <icons.warning className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900">{options.title}</h2>
            {options.message && <div className="mt-2 text-sm leading-relaxed text-slate-600">{options.message}</div>}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button ref={cancelRef} type="button" className="btn-sub" onClick={() => onClose(false)}>
            {options.cancelLabel ?? 'キャンセル'}
          </button>
          <button
            type="button"
            className={
              options.danger
                ? 'inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700'
                : 'btn'
            }
            onClick={() => onClose(true)}
          >
            {options.confirmLabel ?? 'OK'}
          </button>
        </div>
      </div>
    </dialog>
  );
}
