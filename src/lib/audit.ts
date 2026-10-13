import 'server-only';
import { query } from './db';
import { requestMeta } from './request';
import { uuidv7 } from './uuid';

/**
 * 管理画面の操作ログ。誰が・いつ・どこから・何をしたかを残す。
 * diff にはパスワードなどの秘密情報を入れないこと。
 */
export async function writeAudit(input: {
  admin: { id: string; email: string } | null;
  emailSnapshot?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  diff?: Record<string, unknown>;
}): Promise<void> {
  const meta = await requestMeta();
  try {
    await query(
      `INSERT INTO admin_audit_logs
         (id, admin_user_id, admin_email_snapshot, action, target_type, target_id, diff, ip_address, user_agent)
       VALUES (:id, :adminId, :email, :action, :targetType, :targetId, :diff, :ip, :ua)`,
      {
        id: uuidv7(),
        adminId: input.admin?.id ?? null,
        email: (input.admin?.email ?? input.emailSnapshot ?? '').slice(0, 255) || null,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        diff: input.diff ? JSON.stringify(input.diff) : null,
        ip: meta.ip,
        ua: meta.userAgent,
      },
    );
  } catch (e) {
    // 操作ログの失敗で本来の処理を止めない (内容は出さずに記録だけ残す)
    console.error('audit log failed', input.action, (e as Error).name);
  }
}
