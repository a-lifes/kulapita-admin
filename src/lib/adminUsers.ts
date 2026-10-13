import 'server-only';
import { query, queryOne } from './db';

export type Role = 'super_admin' | 'admin' | 'support' | 'readonly';
export const ROLES: Role[] = ['super_admin', 'admin', 'support', 'readonly'];

const RANK: Record<Role, number> = { readonly: 0, support: 1, admin: 2, super_admin: 3 };
export function hasRole(role: Role, min: Role): boolean {
  return RANK[role] >= RANK[min];
}

export type AdminUser = {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  is_active: boolean;
  must_change_password: boolean;
  mfa_enabled: boolean;
  session_version: number;
  failed_login_count: number;
  locked: boolean;
  last_login_at: string | null;
  created_at: string;
};

/** パスワードの照合や 2 段階認証に使う列も含む (画面には出さない) */
export type AdminUserWithSecrets = AdminUser & {
  password_hash: string;
  mfa_secret: string | null;
  mfa_last_step: number | null;
};

const toBool = (v: unknown) => v === true || v === 1 || v === '1';

const COLUMNS = `id, email, display_name, role, is_active, must_change_password,
  mfa_enabled_at, session_version, failed_login_count,
  (locked_until IS NOT NULL AND locked_until > UTC_TIMESTAMP()) AS locked,
  last_login_at, created_at, password_hash, mfa_secret, mfa_last_step`;

function mapRow(r: Record<string, unknown>): AdminUserWithSecrets {
  return {
    id: r.id as string,
    email: r.email as string,
    display_name: r.display_name as string,
    role: r.role as Role,
    is_active: toBool(r.is_active),
    must_change_password: toBool(r.must_change_password),
    mfa_enabled: r.mfa_enabled_at !== null,
    session_version: Number(r.session_version ?? 0),
    failed_login_count: Number(r.failed_login_count ?? 0),
    locked: toBool(r.locked),
    last_login_at: (r.last_login_at as string) ?? null,
    created_at: r.created_at as string,
    password_hash: r.password_hash as string,
    mfa_secret: (r.mfa_secret as string) ?? null,
    mfa_last_step: r.mfa_last_step === null || r.mfa_last_step === undefined ? null : Number(r.mfa_last_step),
  };
}

export function publicUser(u: AdminUserWithSecrets): AdminUser {
  const { password_hash: _p, mfa_secret: _m, mfa_last_step: _s, ...rest } = u;
  void _p;
  void _m;
  void _s;
  return rest;
}

export async function findAdminById(id: string): Promise<AdminUserWithSecrets | null> {
  const r = await queryOne(`SELECT ${COLUMNS} FROM admin_users WHERE id = :id AND deleted_at IS NULL`, { id });
  return r ? mapRow(r) : null;
}

export async function findAdminByEmail(email: string): Promise<AdminUserWithSecrets | null> {
  const r = await queryOne(
    `SELECT ${COLUMNS} FROM admin_users WHERE email = :email AND deleted_at IS NULL`,
    { email },
  );
  return r ? mapRow(r) : null;
}

export async function listAdmins(): Promise<AdminUser[]> {
  const { rows } = await query(
    `SELECT ${COLUMNS} FROM admin_users WHERE deleted_at IS NULL ORDER BY created_at`,
  );
  return rows.map((r) => publicUser(mapRow(r)));
}

/** ログイン失敗を数え、5 回続いたら 15 分ロックする (SET は左から順に評価される点に注意) */
export async function recordLoginFailure(id: string): Promise<void> {
  await query(
    `UPDATE admin_users SET
       locked_until = IF(failed_login_count + 1 >= 5, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 15 MINUTE), locked_until),
       failed_login_count = IF(failed_login_count + 1 >= 5, 0, failed_login_count + 1)
     WHERE id = :id`,
    { id },
  );
}

export async function clearLoginFailures(id: string): Promise<void> {
  await query(
    'UPDATE admin_users SET failed_login_count = 0, locked_until = NULL WHERE id = :id',
    { id },
  );
}
