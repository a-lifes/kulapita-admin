'use server';

import { redirect } from 'next/navigation';
import {
  clearLoginFailures,
  findAdminByEmail,
  findAdminById,
  recordLoginFailure,
} from '@/lib/adminUsers';
import { writeAudit } from '@/lib/audit';
import { burnPasswordCheck, hashPassword, validateNewPassword, verifyPassword } from '@/lib/auth/password';
import { decryptText } from '@/lib/auth/secrets';
import { endSession, PendingStage, readPending, startPending, startSession } from '@/lib/auth/session';
import { verifyTotp } from '@/lib/auth/totp';
import { query } from '@/lib/db';

export type FormState = { error?: string } | undefined;

const GENERIC_LOGIN_ERROR = 'メールアドレスまたはパスワードが違います';
const LOCKED_ERROR = 'ログインに続けて失敗したため、15 分間ログインできません。時間をおいてお試しください';

function nextStage(user: { must_change_password: boolean; mfa_enabled: boolean }): PendingStage {
  if (user.must_change_password) return 'password';
  if (!user.mfa_enabled) return 'mfa_setup';
  return 'mfa';
}

const STAGE_PATH: Record<PendingStage, string> = {
  password: '/setup/password',
  mfa_setup: '/setup/mfa',
  mfa: '/login/mfa',
};

/** 1 段目: メールアドレスとパスワード */
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

  const stage = nextStage(user);
  await startPending({ sub: user.id, ver: user.session_version, stage });
  redirect(STAGE_PATH[stage]);
}

/** 2 段目: 認証アプリの 6 桁コード */
export async function mfaAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const pending = await readPending('mfa');
  if (!pending) redirect('/login?expired=1');
  const user = await findAdminById(pending.sub);
  if (!user || !user.is_active || user.session_version !== pending.ver || !user.mfa_secret || !user.mfa_enabled) {
    redirect('/login?expired=1');
  }
  if (user.locked) return { error: LOCKED_ERROR };

  const step = verifyTotp(decryptText(user.mfa_secret), String(formData.get('code') ?? ''), user.mfa_last_step);
  if (step === null) {
    await recordLoginFailure(user.id);
    await writeAudit({ admin: user, action: 'auth.login_failed', diff: { reason: 'mfa' } });
    return { error: 'コードが違うか、有効期限が切れています' };
  }
  await query(
    'UPDATE admin_users SET mfa_last_step = :step, last_login_at = UTC_TIMESTAMP(), failed_login_count = 0, locked_until = NULL WHERE id = :id',
    { step, id: user.id },
  );
  await startSession({ sub: user.id, ver: user.session_version });
  await writeAudit({ admin: user, action: 'auth.login' });
  redirect('/');
}

/** 初回ログイン・パスワード再発行後: 仮パスワードから自分のパスワードへ変更 */
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

  const hash = await hashPassword(password);
  await query(
    `UPDATE admin_users SET password_hash = :hash, must_change_password = FALSE,
       password_changed_at = UTC_TIMESTAMP(), session_version = session_version + 1
     WHERE id = :id`,
    { hash, id: user.id },
  );
  await clearLoginFailures(user.id);
  await writeAudit({ admin: user, action: 'auth.password_change', diff: { via: 'setup' } });

  const stage: PendingStage = user.mfa_enabled ? 'mfa' : 'mfa_setup';
  await startPending({ sub: user.id, ver: user.session_version + 1, stage });
  redirect(STAGE_PATH[stage]);
}

/** 初回ログイン・2 段階認証のリセット後: 認証アプリの登録 */
export async function setupMfaAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const pending = await readPending('mfa_setup');
  if (!pending) redirect('/login?expired=1');
  const user = await findAdminById(pending.sub);
  if (!user || !user.is_active || user.session_version !== pending.ver || user.mfa_enabled || !user.mfa_secret) {
    redirect('/login?expired=1');
  }

  const step = verifyTotp(decryptText(user.mfa_secret), String(formData.get('code') ?? ''), null);
  if (step === null) return { error: 'コードが違います。アプリに表示されている最新の 6 桁を入力してください' };

  await query(
    `UPDATE admin_users SET mfa_enabled_at = UTC_TIMESTAMP(), mfa_last_step = :step,
       last_login_at = UTC_TIMESTAMP(), failed_login_count = 0, locked_until = NULL
     WHERE id = :id AND mfa_enabled_at IS NULL`,
    { step, id: user.id },
  );
  await startSession({ sub: user.id, ver: user.session_version });
  await writeAudit({ admin: user, action: 'auth.mfa_setup' });
  await writeAudit({ admin: user, action: 'auth.login' });
  redirect('/');
}

export async function cancelLoginAction(): Promise<void> {
  await endSession();
  redirect('/login');
}
