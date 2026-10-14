'use server';

import { revalidatePath } from 'next/cache';
import { findAdminById, ROLES, Role } from '@/lib/adminUsers';
import { writeAudit } from '@/lib/audit';
import { requireAdmin } from '@/lib/auth/guard';
import { generateTemporaryPassword, hashPassword } from '@/lib/auth/password';
import { isDuplicateError, query, queryOne } from '@/lib/db';
import { uuidv7, UUID_RE } from '@/lib/uuid';

export type UserActionState = { error?: string; message?: string; tempPassword?: string } | undefined;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function activeSuperAdminCount(): Promise<number> {
  const r = await queryOne<{ n: number }>(
    "SELECT COUNT(*) AS n FROM admin_users WHERE role = 'super_admin' AND is_active = TRUE AND deleted_at IS NULL",
  );
  return Number(r?.n ?? 0);
}

export async function createAdminAction(_prev: UserActionState, formData: FormData): Promise<UserActionState> {
  const admin = await requireAdmin('super_admin');
  const email = String(formData.get('email') ?? '').trim().toLowerCase().slice(0, 255);
  const displayName = String(formData.get('display_name') ?? '').trim().slice(0, 100);
  const role = String(formData.get('role') ?? '') as Role;
  if (!EMAIL_RE.test(email)) return { error: 'メールアドレスの形式が正しくありません' };
  if (!displayName) return { error: '表示名を入力してください' };
  if (!ROLES.includes(role)) return { error: '権限を選んでください' };

  const tempPassword = generateTemporaryPassword();

  // 以前削除したアカウントと同じメールアドレスなら、その行を新しいアカウントとして作り直す
  // (メールアドレスは削除済みの行とも重複できないため)
  const deleted = await queryOne<{ id: string }>(
    'SELECT id FROM admin_users WHERE email = :email AND deleted_at IS NOT NULL',
    { email },
  );
  if (deleted) {
    await query(
      `UPDATE admin_users SET password_hash = :hash, display_name = :name, role = :role, is_active = TRUE,
         must_change_password = TRUE, password_changed_at = NULL, failed_login_count = 0, locked_until = NULL,
         mfa_secret = NULL, mfa_enabled_at = NULL, mfa_last_step = NULL, last_login_at = NULL,
         session_version = session_version + 1, deleted_at = NULL, created_at = UTC_TIMESTAMP()
       WHERE id = :id`,
      { hash: await hashPassword(tempPassword), name: displayName, role, id: deleted.id },
    );
    await writeAudit({ admin, action: 'admin_user.create', targetType: 'admin_user', targetId: deleted.id, diff: { email, role } });
    revalidatePath('/users');
    return { message: `${email} を追加しました。`, tempPassword };
  }

  const id = uuidv7();
  try {
    await query(
      `INSERT INTO admin_users (id, email, password_hash, display_name, role, is_active, must_change_password)
       VALUES (:id, :email, :hash, :name, :role, TRUE, TRUE)`,
      { id, email, hash: await hashPassword(tempPassword), name: displayName, role },
    );
  } catch (e) {
    if (isDuplicateError(e)) return { error: 'このメールアドレスは登録済みです' };
    throw e;
  }
  await writeAudit({ admin, action: 'admin_user.create', targetType: 'admin_user', targetId: id, diff: { email, role } });
  revalidatePath('/users');
  return { message: `${email} を追加しました。`, tempPassword };
}

export async function resetPasswordAction(id: string): Promise<UserActionState> {
  const admin = await requireAdmin('super_admin');
  if (!UUID_RE.test(id)) return { error: '対象が見つかりません' };
  const target = await findAdminById(id);
  if (!target) return { error: '対象が見つかりません' };
  const tempPassword = generateTemporaryPassword();
  await query(
    `UPDATE admin_users SET password_hash = :hash, must_change_password = TRUE, failed_login_count = 0,
       locked_until = NULL, session_version = session_version + 1
     WHERE id = :id`,
    { hash: await hashPassword(tempPassword), id },
  );
  await writeAudit({ admin, action: 'admin_user.reset_password', targetType: 'admin_user', targetId: id });
  revalidatePath('/users');
  return { message: `${target.email} の仮パスワードを発行しました。`, tempPassword };
}

export async function updateAdminAction(id: string, _prev: UserActionState, formData: FormData): Promise<UserActionState> {
  const admin = await requireAdmin('super_admin');
  if (!UUID_RE.test(id)) return { error: '対象が見つかりません' };
  const target = await findAdminById(id);
  if (!target) return { error: '対象が見つかりません' };

  const role = String(formData.get('role') ?? '') as Role;
  const isActive = formData.get('is_active') === 'on';
  const displayName = String(formData.get('display_name') ?? '').trim().slice(0, 100);
  if (!ROLES.includes(role)) return { error: '権限が不正です' };
  if (!displayName) return { error: '表示名を入力してください' };
  if (id === admin.id && (role !== target.role || !isActive)) {
    return { error: '自分自身の権限変更・停止はできません（別の上級管理者が行ってください）' };
  }
  const losesSuper = target.role === 'super_admin' && target.is_active && (role !== 'super_admin' || !isActive);
  if (losesSuper && (await activeSuperAdminCount()) <= 1) {
    return { error: '有効な上級管理者が 1 人もいなくなるため変更できません' };
  }

  const diff: Record<string, unknown> = {};
  if (role !== target.role) diff.role = { from: target.role, to: role };
  if (isActive !== target.is_active) diff.is_active = { from: target.is_active, to: isActive };
  if (displayName !== target.display_name) diff.display_name = { from: target.display_name, to: displayName };
  if (Object.keys(diff).length === 0) return { message: '変更はありません' };

  await query(
    `UPDATE admin_users SET role = :role, is_active = :active, display_name = :name,
       session_version = session_version + IF(:bump, 1, 0)
     WHERE id = :id`,
    // 停止・権限変更したときは、その人のログイン中の画面もすぐに無効にする
    { role, active: isActive, name: displayName, bump: Boolean(diff.role || diff.is_active), id },
  );
  await writeAudit({ admin, action: 'admin_user.update', targetType: 'admin_user', targetId: id, diff });
  revalidatePath('/users');
  return { message: '保存しました' };
}

/** 削除 (行は残し、削除済みにする。ログインはすぐできなくなる) */
export async function deleteAdminAction(id: string): Promise<UserActionState> {
  const admin = await requireAdmin('super_admin');
  if (!UUID_RE.test(id)) return { error: '対象が見つかりません' };
  if (id === admin.id) return { error: '自分自身は削除できません（別の上級管理者が行ってください）' };
  const target = await findAdminById(id);
  if (!target) return { error: '対象が見つかりません' };
  if (target.role === 'super_admin' && target.is_active && (await activeSuperAdminCount()) <= 1) {
    return { error: '有効な上級管理者が 1 人もいなくなるため削除できません' };
  }
  await query(
    `UPDATE admin_users SET deleted_at = UTC_TIMESTAMP(), is_active = FALSE, session_version = session_version + 1
     WHERE id = :id AND deleted_at IS NULL`,
    { id },
  );
  await writeAudit({
    admin,
    action: 'admin_user.delete',
    targetType: 'admin_user',
    targetId: id,
    diff: { email: target.email, role: target.role },
  });
  revalidatePath('/users');
  return { message: `${target.display_name}（${target.email}）を削除しました。` };
}
