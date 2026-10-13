'use client';

import { useActionState } from 'react';
import { cancelLoginAction, FormState, loginAction, setupPasswordAction } from './actions';

function ErrorText({ state }: { state: FormState }) {
  return state?.error ? <p className="error mb-4">{state.error}</p> : null;
}

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <ErrorText state={state} />
      <div>
        <label className="label" htmlFor="email">メールアドレス</label>
        <input className="input" id="email" name="email" type="email" autoComplete="username" required />
      </div>
      <div>
        <label className="label" htmlFor="password">パスワード</label>
        <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <button className="btn w-full" disabled={pending}>{pending ? '確認中…' : 'ログイン'}</button>
    </form>
  );
}

export function SetupPasswordForm() {
  const [state, action, pending] = useActionState(setupPasswordAction, undefined);
  return (
    <>
      <form action={action} className="space-y-4">
        <ErrorText state={state} />
        <p className="text-sm">
          仮パスワードでログインしました。ご自身のパスワードを設定してください。
          <br />
          <span className="text-slate-500">12 文字以上で、英字と数字を両方含めてください。</span>
        </p>
        <div>
          <label className="label" htmlFor="password">新しいパスワード</label>
          <input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={12} required />
        </div>
        <div>
          <label className="label" htmlFor="confirm">新しいパスワード (確認)</label>
          <input className="input" id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={12} required />
        </div>
        <button className="btn w-full" disabled={pending}>{pending ? '保存中…' : '設定してログイン'}</button>
      </form>
      <form action={cancelLoginAction} className="mt-4 text-center">
        <button className="text-sm text-slate-500 underline">ログイン画面に戻る</button>
      </form>
    </>
  );
}
