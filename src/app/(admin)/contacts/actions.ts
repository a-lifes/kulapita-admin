'use server';

import { revalidatePath } from 'next/cache';
import { writeAudit } from '@/lib/audit';
import { requireAdmin } from '@/lib/auth/guard';
import { query, queryOne } from '@/lib/db';
import { CONTACT_STATUSES } from '@/lib/queries/contacts';
import { UUID_RE } from '@/lib/uuid';

/**
 * 一覧からお問い合わせの対応状況を変える。
 * 一覧で変えたときは、担当者を「その操作をした人」にする (詳細画面では担当者を選べる)。
 * 対応済みにしたときは、対応完了日時を記録する (まだ記録が無いときだけ)。
 */
const DONE_STATUSES = ['completed'];

export async function setContactStatusAction(
  id: string,
  status: string,
): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  const admin = await requireAdmin('support');
  if (!UUID_RE.test(id) || !CONTACT_STATUSES.includes(status as never)) return { ok: false, error: '指定が不正です' };
  const row = await queryOne<{ status: string; assigned_to: string | null }>(
    'SELECT status, assigned_to FROM contacts WHERE id = :id AND deleted_at IS NULL',
    { id },
  );
  if (!row) return { ok: false, error: 'お問い合わせが見つかりません' };
  if (row.status === status) return { ok: true, status };
  await query(
    `UPDATE contacts SET status = :status, assigned_to = :admin,
       responded_at = IF(:done AND responded_at IS NULL, UTC_TIMESTAMP(), responded_at)
     WHERE id = :id`,
    { id, status, admin: admin.id, done: DONE_STATUSES.includes(status) },
  );
  const diff: Record<string, unknown> = { status: { from: row.status, to: status } };
  if (row.assigned_to !== admin.id) diff.assigned_to = { from: row.assigned_to, to: admin.id };
  await writeAudit({ admin, action: 'contact.update_status', targetType: 'contact', targetId: id, diff });
  revalidatePath('/contacts');
  revalidatePath(`/contacts/${id}`);
  return { ok: true, status };
}

/** 選んだお問い合わせの対応状況をまとめて設定する (一度に 100 件まで)。担当者は操作した人にする */
export async function setContactStatusBulkAction(
  ids: string[],
  status: string,
): Promise<{ ok: true; updated: number } | { ok: false; error: string }> {
  const admin = await requireAdmin('support');
  const uniq = [...new Set(ids)];
  if (uniq.length === 0) return { ok: false, error: 'お問い合わせを選んでください' };
  if (uniq.length > 100) return { ok: false, error: '一度に設定できるのは 100 件までです' };
  if (!uniq.every((id) => UUID_RE.test(id)) || !CONTACT_STATUSES.includes(status as never)) {
    return { ok: false, error: '指定が不正です' };
  }
  const params: Record<string, string | boolean> = { status, admin: admin.id, done: DONE_STATUSES.includes(status) };
  uniq.forEach((id, i) => (params[`id${i}`] = id));
  const { affected } = await query(
    `UPDATE contacts SET status = :status, assigned_to = :admin,
       responded_at = IF(:done AND responded_at IS NULL, UTC_TIMESTAMP(), responded_at)
     WHERE id IN (${uniq.map((_, i) => `:id${i}`).join(', ')}) AND deleted_at IS NULL AND status <> :status`,
    params,
  );
  await writeAudit({
    admin,
    action: 'contact.bulk_update_status',
    targetType: 'contact',
    diff: { status, assigned_to: admin.id, count: affected, ids: uniq },
  });
  revalidatePath('/contacts');
  return { ok: true, updated: affected };
}
