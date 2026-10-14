'use server';

import { revalidatePath } from 'next/cache';
import { writeAudit } from '@/lib/audit';
import { requireAdmin } from '@/lib/auth/guard';
import { query, queryOne } from '@/lib/db';
import { NEWSLETTER_STATUSES } from '@/lib/queries/lists';
import { UUID_RE } from '@/lib/uuid';

/**
 * メルマガの状態 (未対応 / 登録済 / 登録対象外) を設定する。
 * 配信は別システムなので、担当者が配信システムに登録したら「登録済」にする。
 */
export async function setNewsletterStatusAction(
  id: string,
  status: string,
): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  const admin = await requireAdmin('support');
  if (!UUID_RE.test(id) || !NEWSLETTER_STATUSES.includes(status as never)) return { ok: false, error: '指定が不正です' };
  const row = await queryOne<{ status: string }>(
    'SELECT status FROM newsletter_subscribers WHERE id = :id AND deleted_at IS NULL',
    { id },
  );
  if (!row) return { ok: false, error: '登録が見つかりません' };
  if (row.status === status) return { ok: true, status };
  await query('UPDATE newsletter_subscribers SET status = :status WHERE id = :id', { id, status });
  await writeAudit({
    admin,
    action: 'newsletter.update_status',
    targetType: 'newsletter_subscriber',
    targetId: id,
    diff: { status: { from: row.status, to: status } },
  });
  revalidatePath('/newsletter');
  return { ok: true, status };
}

/** 選んだ登録の状態をまとめて設定する (一度に 100 件まで) */
export async function setNewsletterStatusBulkAction(
  ids: string[],
  status: string,
): Promise<{ ok: true; updated: number } | { ok: false; error: string }> {
  const admin = await requireAdmin('support');
  const uniq = [...new Set(ids)];
  if (uniq.length === 0) return { ok: false, error: '登録を選んでください' };
  if (uniq.length > 100) return { ok: false, error: '一度に設定できるのは 100 件までです' };
  if (!uniq.every((id) => UUID_RE.test(id)) || !NEWSLETTER_STATUSES.includes(status as never)) {
    return { ok: false, error: '指定が不正です' };
  }
  const params: Record<string, string> = { status };
  uniq.forEach((id, i) => (params[`id${i}`] = id));
  const { affected } = await query(
    `UPDATE newsletter_subscribers SET status = :status
     WHERE id IN (${uniq.map((_, i) => `:id${i}`).join(', ')}) AND deleted_at IS NULL AND status <> :status`,
    params,
  );
  await writeAudit({
    admin,
    action: 'newsletter.bulk_update_status',
    targetType: 'newsletter_subscriber',
    diff: { status, count: affected, ids: uniq },
  });
  revalidatePath('/newsletter');
  return { ok: true, updated: affected };
}
