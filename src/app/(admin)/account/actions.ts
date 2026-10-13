'use server';

import { findAdminById } from '@/lib/adminUsers';
import { writeAudit } from '@/lib/audit';
import { requireAdmin } from '@/lib/auth/guard';
import { hashPassword, validateNewPassword, verifyPassword } from '@/lib/auth/password';
import { startSession } from '@/lib/auth/session';
import { query } from '@/lib/db';

export type AccountState = { error?: string; message?: string } | undefined;

export async function changePasswordAction(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const admin = await requireAdmin();
  const user = await findAdminById(admin.id);
  if (!user) return { error: 'アカウントが見つかりません' };

  const current = String(formData.get('current') ?? '');
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');
  if (!(await verifyPassword(current, user.password_hash))) return { error: '今のパスワードが違います' };
  if (password !== confirm) return { error: '確認用のパスワードが一致しません' };
  const invalid = validateNewPassword(password, user.email);
  if (invalid) return { error: invalid };
  if (password === current) return { error: '今と別のパスワードにしてください' };

  await query(
    `UPDATE admin_users SET password_hash = :hash, password_changed_at = UTC_TIMESTAMP(),
       session_version = session_version + 1
     WHERE id = :id`,
    { hash: await hashPassword(password), id: user.id },
  );
  // ほかの端末のログインは無効になり、この端末だけ新しい状態でログインし直す
  await startSession({ sub: user.id, ver: user.session_version + 1 });
  await writeAudit({ admin, action: 'auth.password_change', diff: { via: 'account' } });
  return { message: 'パスワードを変更しました。ほかの端末ではログインし直してください。' };
}
