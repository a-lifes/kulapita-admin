'use client';

import { useActionState, useState } from 'react';
import { useConfirm } from '@/components/ConfirmDialog';
import { ROLE_LABEL } from '@/lib/format';
import {
  createAdminAction,
  resetPasswordAction,
  updateAdminAction,
  UserActionState,
} from './actions';

const ROLES = ['super_admin', 'admin', 'support', 'readonly'];

function Result({ state }: { state: UserActionState }) {
  if (!state) return null;
  return (
    <div className="space-y-2">
      {state.error && <p className="error">{state.error}</p>}
      {state.message && <p className="notice">{state.message}</p>}
      {state.tempPassword && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="font-semibold">仮パスワード（この画面を閉じると二度と表示されません）</p>
          <p className="my-2 select-all font-mono text-lg">{state.tempPassword}</p>
          <p className="text-xs text-slate-600">
            本人に口頭や社内チャットの個別メッセージなど、メール以外の方法で伝えてください。初回ログイン時にパスワードの変更を求められます。
          </p>
        </div>
      )}
    </div>
  );
}

export function CreateAdminForm() {
  const [state, action, pending] = useActionState(createAdminAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <Result state={state} />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <label className="label" htmlFor="new-email">メールアドレス</label>
          <input className="input" id="new-email" name="email" type="email" required />
        </div>
        <div>
          <label className="label" htmlFor="new-name">表示名</label>
          <input className="input" id="new-name" name="display_name" required maxLength={100} />
        </div>
        <div>
          <label className="label" htmlFor="new-role">権限</label>
          <select className="input" id="new-role" name="role" defaultValue="support">
            {ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
          </select>
        </div>
      </div>
      <button className="btn" disabled={pending}>{pending ? '追加中…' : '追加して仮パスワードを発行'}</button>
    </form>
  );
}

export function EditAdminForm({
  user,
  isSelf,
}: {
  user: { id: string; display_name: string; role: string; is_active: boolean };
  isSelf: boolean;
}) {
  const [state, action, pending] = useActionState<UserActionState, FormData>(
    updateAdminAction.bind(null, user.id),
    undefined,
  );
  const [resetState, setResetState] = useState<UserActionState>(undefined);
  const [busy, setBusy] = useState(false);
  const [confirm, dialog] = useConfirm();

  async function resetPassword() {
    const ok = await confirm({
      title: '仮パスワードを発行しますか？',
      message: `${user.display_name} さんの今のパスワードは使えなくなります。ロックされている場合は解除されます。`,
      confirmLabel: '発行する',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      setResetState(await resetPasswordAction(user.id));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {dialog}
      <form action={action} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor={`name-${user.id}`}>表示名</label>
          <input className="input" id={`name-${user.id}`} name="display_name" defaultValue={user.display_name} maxLength={100} />
        </div>
        <div>
          <label className="label" htmlFor={`role-${user.id}`}>権限</label>
          <select className="input" id={`role-${user.id}`} name="role" defaultValue={user.role} disabled={isSelf}>
            {ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
          </select>
          {isSelf && <input type="hidden" name="role" value={user.role} />}
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="is_active" defaultChecked={user.is_active} disabled={isSelf} />
          有効
          {isSelf && user.is_active && <input type="hidden" name="is_active" value="on" />}
        </label>
        <button className="btn-sub" disabled={pending}>保存</button>
        <button type="button" className="btn-danger" disabled={busy} onClick={resetPassword}>
          仮パスワード再発行
        </button>
      </form>
      <Result state={state} />
      <Result state={resetState} />
    </div>
  );
}
