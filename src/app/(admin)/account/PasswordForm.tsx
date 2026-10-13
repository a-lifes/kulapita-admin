'use client';

import { useActionState } from 'react';
import { changePasswordAction } from './actions';

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, undefined);
  return (
    <form action={action} className="max-w-md space-y-4">
      {state?.error && <p className="error">{state.error}</p>}
      {state?.message && <p className="notice">{state.message}</p>}
      <div>
        <label className="label" htmlFor="current">今のパスワード</label>
        <input className="input" id="current" name="current" type="password" autoComplete="current-password" required />
      </div>
      <div>
        <label className="label" htmlFor="password">新しいパスワード</label>
        <input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={12} required />
        <p className="mt-1 text-xs text-slate-500">12 文字以上で、英字と数字を両方含めてください。</p>
      </div>
      <div>
        <label className="label" htmlFor="confirm">新しいパスワード (確認)</label>
        <input className="input" id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={12} required />
      </div>
      <button className="btn" disabled={pending}>{pending ? '変更中…' : '変更する'}</button>
    </form>
  );
}
