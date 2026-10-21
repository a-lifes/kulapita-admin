'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useConfirm } from '@/components/ConfirmDialog';
import { icons, spacedLabel } from '@/components/icons';
import { toast } from '@/components/Toaster';
import { addIpAction, deleteIpAction, resyncWafAction, updateIpAction } from './actions';

/** 追加 (＋ボタン → 画面中央のダイアログで入力 → 結果はスナックバー) */
export function AddIpButton() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="btn min-w-20 px-3"
        aria-label="追加"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <icons.plus className="h-4 w-4" />
        {spacedLabel('追加')}
      </button>
      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === ref.current) setOpen(false);
        }}
        className="m-auto w-[min(520px,92vw)] rounded-xl p-0 text-left font-normal whitespace-normal break-words shadow-2xl backdrop:bg-slate-900/50"
      >
        {open && (
          <form
            className="p-6"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              startTransition(async () => {
                const res = await addIpAction(undefined, fd);
                if (res?.error) {
                  setError(res.error);
                  return;
                }
                setOpen(false);
                if (res?.message) toast.success(res.message);
                if (res?.warning) toast.warning(res.warning);
              });
            }}
          >
            <h2 className="mb-4 text-base font-bold text-slate-900">許可 IP の追加</h2>
            {error && <p className="error mb-4">{error}</p>}
            <div className="space-y-4">
              <div>
                <label className="label" htmlFor="new-cidr">IP アドレス（CIDR）</label>
                <input className="input font-mono" id="new-cidr" name="cidr" placeholder="152.165.122.145/32" required autoFocus />
              </div>
              <div>
                <label className="label" htmlFor="new-label">メモ（IPアドレスの説明、補足情報など）</label>
                <input className="input" id="new-label" name="label" maxLength={100} placeholder="本社" />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" className="btn-sub" onClick={() => setOpen(false)}>キャンセル</button>
              <button className="btn" disabled={pending}>{pending ? '追加中…' : '追加'}</button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}

/** 編集 (鉛筆アイコン → 画面中央のダイアログで IP アドレスとメモを変更) */
export function EditIpButton({ id, cidr, label }: { id: string; cidr: string; label: string | null }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="rounded-md p-2 text-slate-500 hover:bg-nav-active hover:text-brand"
        aria-label={`${cidr} を編集`}
        title="編集"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <icons.pencil className="h-5 w-5" />
      </button>
      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === ref.current) setOpen(false);
        }}
        className="m-auto w-[min(520px,92vw)] rounded-xl p-0 text-left font-normal whitespace-normal break-words shadow-2xl backdrop:bg-slate-900/50"
      >
        {open && (
          <form
            className="p-6"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              startTransition(async () => {
                const res = await updateIpAction(id, String(fd.get('cidr') ?? ''), String(fd.get('label') ?? ''));
                if (res?.error) {
                  setError(res.error);
                  return;
                }
                setOpen(false);
                if (res?.message) toast.success(res.message);
                if (res?.warning) toast.warning(res.warning);
              });
            }}
          >
            <h2 className="mb-4 text-base font-bold text-slate-900">許可 IP の編集</h2>
            {error && <p className="error mb-4">{error}</p>}
            <div className="space-y-4">
              <div>
                <label className="label" htmlFor={`cidr-${id}`}>IP アドレス（CIDR）</label>
                <input className="input font-mono" id={`cidr-${id}`} name="cidr" defaultValue={cidr} required autoFocus />
              </div>
              <div>
                <label className="label" htmlFor={`label-${id}`}>メモ（IPアドレスの説明、補足情報など）</label>
                <input className="input" id={`label-${id}`} name="label" defaultValue={label ?? ''} maxLength={100} />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" className="btn-sub" onClick={() => setOpen(false)}>キャンセル</button>
              <button className="btn" disabled={pending}>{pending ? '保存中…' : '保存'}</button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}

export function DeleteIpButton({ id, cidr, label }: { id: string; cidr: string; label: string | null }) {
  const [busy, setBusy] = useState(false);
  const [confirm, dialog] = useConfirm();
  return (
    <>
      {dialog}
      <button
        type="button"
        className="rounded-md p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
        disabled={busy}
        aria-label={`${cidr} を削除`}
        title="削除"
        onClick={async () => {
          const ok = await confirm({
            title: '許可 IP を削除しますか？',
            message: (
              <>
                <p className="font-mono font-semibold text-slate-900">
                  {cidr}
                  {label && <span className="ml-2 font-sans font-normal text-slate-600">{label}</span>}
                </p>
                <p className="mt-2">削除すると、この IP アドレスからは管理画面に入れなくなります。</p>
              </>
            ),
            confirmLabel: '削除する',
            danger: true,
          });
          if (!ok) return;
          setBusy(true);
          try {
            // 一覧の行には結果を出さず、画面下のスナックバーで知らせる
            const res = await deleteIpAction(id);
            if (res?.error) toast.error(res.error);
            if (res?.message) toast.success(res.message);
            if (res?.warning) toast.warning(res.warning);
          } finally {
            setBusy(false);
          }
        }}
      >
        <icons.trash className="h-5 w-5" />
      </button>
    </>
  );
}

/** WAF に再反映 (DB の許可 IP 一覧で WAF を上書きする。結果はスナックバー) */
export function ResyncButton() {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="btn-sub"
      disabled={pending}
      title="DB の許可 IP 一覧で WAF（入口の防御）を上書きします"
      onClick={() =>
        startTransition(async () => {
          const res = await resyncWafAction();
          if (res?.error) toast.error(res.error);
          if (res?.message) toast.success(res.message);
          if (res?.warning) toast.warning(res.warning);
        })
      }
    >
      {pending ? '反映中…' : 'WAF に反映'}
    </button>
  );
}
