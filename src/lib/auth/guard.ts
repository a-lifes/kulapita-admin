import 'server-only';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { AdminUser, findAdminById, hasRole, publicUser, Role } from '../adminUsers';
import { readSession } from './session';

/**
 * 今のリクエストのログイン中ユーザー。Cookie の署名・有効期限に加えて、
 * DB 上でも有効 (停止・削除・ロックされていない / パスワード変更などで無効化されていない) かを毎回確かめる。
 */
export const getCurrentAdmin = cache(async (): Promise<AdminUser | null> => {
  const claims = await readSession();
  if (!claims) return null;
  const user = await findAdminById(claims.sub);
  if (
    !user ||
    !user.is_active ||
    user.locked ||
    user.session_version !== claims.ver ||
    user.must_change_password
  ) {
    return null;
  }
  return publicUser(user);
});

/** 画面・サーバー処理の入口で呼ぶ。未ログインならログイン画面へ、権限不足ならトップへ */
export async function requireAdmin(min: Role = 'readonly'): Promise<AdminUser> {
  const user = await getCurrentAdmin();
  if (!user) redirect('/login');
  if (!hasRole(user.role, min)) redirect('/?denied=1');
  return user;
}
