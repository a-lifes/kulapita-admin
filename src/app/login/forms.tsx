'use client';

import { useActionState } from 'react';
import {
  cancelLoginAction,
  FormState,
  loginAction,
  mfaAction,
  setupMfaAction,
  setupPasswordAction,
} from './actions';

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
      <button className="btn w-full" disabled={pending}>{pending ? '確認中…' : '次へ'}</button>
    </form>
  );
}

function CodeInput() {
  return (
    <input
      className="input text-center text-2xl tracking-[0.5em]"
      name="code"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="\d{6}"
      maxLength={6}
      required
      autoFocus
    />
  );
}

function CancelButton() {
  return (
    <form action={cancelLoginAction} className="mt-4 text-center">
      <button className="text-sm text-slate-500 underline">ログイン画面に戻る</button>
    </form>
  );
}

export function MfaForm() {
  const [state, action, pending] = useActionState(mfaAction, undefined);
  return (
    <>
      <form action={action} className="space-y-4">
        <ErrorText state={state} />
        <p className="text-sm">認証アプリに表示されている 6 桁のコードを入力してください。</p>
        <CodeInput />
        <button className="btn w-full" disabled={pending}>{pending ? '確認中…' : 'ログイン'}</button>
      </form>
      <CancelButton />
    </>
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
        <button className="btn w-full" disabled={pending}>{pending ? '保存中…' : '設定して次へ'}</button>
      </form>
      <CancelButton />
    </>
  );
}

export function SetupMfaForm() {
  const [state, action, pending] = useActionState(setupMfaAction, undefined);
  return (
    <>
      <form action={action} className="space-y-4">
        <ErrorText state={state} />
        <CodeInput />
        <button className="btn w-full" disabled={pending}>{pending ? '確認中…' : '登録してログイン'}</button>
      </form>
      <CancelButton />
    </>
  );
}
