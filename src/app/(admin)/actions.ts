'use server';

import { redirect } from 'next/navigation';
import { writeAudit } from '@/lib/audit';
import { getCurrentAdmin } from '@/lib/auth/guard';
import { endSession } from '@/lib/auth/session';
import { query } from '@/lib/db';

export async function logoutAction(): Promise<void> {
  const admin = await getCurrentAdmin();
  if (admin) {
    // ログイン状態 (署名付き Cookie) はブラウザから消すだけだと、ログアウト前に盗まれていた場合に
    // 有効期限 (8 時間) まで使えてしまう。session_version を上げて、この人のこれまでのログイン状態をすべて無効にする
    // (ほかの PC・ブラウザで開いている管理画面からも、まとめてログアウトされる)
    await query('UPDATE admin_users SET session_version = session_version + 1 WHERE id = :id', { id: admin.id });
    await writeAudit({ admin, action: 'auth.logout' });
  }
  await endSession();
  redirect('/login');
}
