'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  clearLoginFailures,
  findAdminByEmail,
  findAdminById,
  recordLoginFailure,
} from '@/lib/adminUsers';
import { writeAudit } from '@/lib/audit';
import { burnPasswordCheck, hashPassword, validateNewPassword, verifyPassword } from '@/lib/auth/password';
import { endSession, readPending, startPending, startSession } from '@/lib/auth/session';
import { query } from '@/lib/db';
import { LAST_EMAIL_COOKIE } from './lastEmail';

/**
 * ログインは「メールアドレス + パスワード」。
 * 2 段階認証は使わない (入口を許可 IP で制限しているため)。
 */
export type FormState = { error?: string } | undefined;

/** 前回ログインしたメールアドレスを覚えておく (次回ログイン画面に入れておく)。パスワードは保存しない */
async function rememberEmail(email: string) {
  (await cookies()).set(LAST_EMAIL_COOKIE, email, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/login',
    maxAge: 60 * 60 * 24 * 365,
  });
}

const GENERIC_LOGIN_ERROR = 'メールアドレスまたはパスワードが違います';
const LOCKED_ERROR = 'ログインに続けて失敗したため、15 分間ログインできません。時間をおいてお試しください';

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase().slice(0, 255);
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { error: 'メールアドレスとパスワードを入力してください' };

  const user = await findAdminByEmail(email);
  if (!user) {
    await burnPasswordCheck(password);
    await writeAudit({ admin: null, emailSnapshot: email, action: 'auth.login_failed' });
    return { error: GENERIC_LOGIN_ERROR };
  }
  if (user.locked) return { error: LOCKED_ERROR };
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok || !user.is_active) {
    if (!ok) await recordLoginFailure(user.id);
    await writeAudit({ admin: user, action: 'auth.login_failed', diff: { reason: ok ? 'inactive' : 'password' } });
    return { error: GENERIC_LOGIN_ERROR };
  }

  // パスワードが合っていたら、次回のためにメールアドレスを覚えておく
  await rememberEmail(email);

  // 仮パスワードのままなら、先に自分のパスワードを設定してもらう
  if (user.must_change_password) {
    await startPending({ sub: user.id, ver: user.session_version, stage: 'password' });
    redirect('/setup/password');
  }

  await query(
    'UPDATE admin_users SET last_login_at = UTC_TIMESTAMP(), failed_login_count = 0, locked_until = NULL WHERE id = :id',
    { id: user.id },
  );
  await startSession({ sub: user.id, ver: user.session_version });
  await writeAudit({ admin: user, action: 'auth.login' });
  redirect('/');
}

/** 初回ログイン・仮パスワード再発行後: 自分のパスワードへ変更してログイン完了 */
export async function setupPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const pending = await readPending('password');
  if (!pending) redirect('/login?expired=1');
  const user = await findAdminById(pending.sub);
  if (!user || !user.is_active || user.session_version !== pending.ver) redirect('/login?expired=1');

  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');
  if (password !== confirm) return { error: '確認用のパスワードが一致しません' };
  const invalid = validateNewPassword(password, user.email);
  if (invalid) return { error: invalid };
  if (await verifyPassword(password, user.password_hash)) {
    return { error: '仮パスワードとは別のパスワードにしてください' };
  }

  await query(
    `UPDATE admin_users SET password_hash = :hash, must_change_password = FALSE,
       password_changed_at = UTC_TIMESTAMP(), session_version = session_version + 1,
       last_login_at = UTC_TIMESTAMP()
     WHERE id = :id`,
    { hash: await hashPassword(password), id: user.id },
  );
  await clearLoginFailures(user.id);
  await startSession({ sub: user.id, ver: user.session_version + 1 });
  await writeAudit({ admin: user, action: 'auth.password_change', diff: { via: 'setup' } });
  await writeAudit({ admin: user, action: 'auth.login' });
  redirect('/');
}

export async function cancelLoginAction(): Promise<void> {
  await endSession();
  redirect('/login');
}
