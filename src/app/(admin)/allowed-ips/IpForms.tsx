'use client';

import { useActionState, useState } from 'react';
import { useConfirm } from '@/components/ConfirmDialog';
import { icons } from '@/components/icons';
import { addIpAction, deleteIpAction, IpActionState, resyncWafAction } from './actions';

function Result({ state }: { state: IpActionState }) {
  if (!state) return null;
  return (
    <div className="space-y-2">
      {state.error && <p className="error">{state.error}</p>}
      {state.message && <p className="notice">{state.message}</p>}
      {state.warning && <p className="error">{state.warning}</p>}
    </div>
  );
}

export function AddIpForm({ currentIp }: { currentIp: string | null }) {
  const [state, action, pending] = useActionState(addIpAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <Result state={state} />
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="cidr">IP アドレス（CIDR）</label>
          <input className="input font-mono" id="cidr" name="cidr" placeholder="152.165.122.145/32" required />
        </div>
        <div className="min-w-64 flex-1">
          <label className="label" htmlFor="label">メモ（IPアドレスの説明、補足情報など）</label>
          <input className="input" id="label" name="label" maxLength={100} placeholder="本社" />
        </div>
        <button className="btn" disabled={pending}>{pending ? '追加中…' : '追加'}</button>
      </div>
      <p className="text-xs text-slate-500">
        1 台だけなら末尾を /32 にします（「/」を省くと /32 として登録します）。今お使いの IP: {currentIp ?? '不明'}
      </p>
    </form>
  );
}

export function DeleteIpButton({ id, cidr, label }: { id: string; cidr: string; label: string | null }) {
  const [state, setState] = useState<IpActionState>(undefined);
  const [busy, setBusy] = useState(false);
  const [confirm, dialog] = useConfirm();
  return (
    <div className="space-y-2">
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
            setState(await deleteIpAction(id));
          } finally {
            setBusy(false);
          }
        }}
      >
        <icons.trash className="h-5 w-5" />
      </button>
      <Result state={state} />
    </div>
  );
}

export function ResyncButton() {
  const [state, action, pending] = useActionState(resyncWafAction, undefined);
  return (
    <form action={action} className="space-y-2">
      <button className="btn-sub" disabled={pending}>{pending ? '反映中…' : 'WAF に再反映'}</button>
      <Result state={state} />
    </form>
  );
}
