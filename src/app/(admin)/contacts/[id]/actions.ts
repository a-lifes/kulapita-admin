'use server';

import { revalidatePath } from 'next/cache';
import { writeAudit } from '@/lib/audit';
import { requireAdmin } from '@/lib/auth/guard';
import { query, queryOne } from '@/lib/db';
import { CONTACT_STATUSES } from '@/lib/queries/contacts';
import { UUID_RE } from '@/lib/uuid';

export type ContactFormState = { error?: string; saved?: boolean } | undefined;

export async function updateContactAction(
  id: string,
  _prev: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const admin = await requireAdmin('support');
  if (!UUID_RE.test(id)) return { error: '対象が見つかりません' };

  const status = String(formData.get('status') ?? '');
  const assignedTo = String(formData.get('assigned_to') ?? '') || null;
  const notes = String(formData.get('admin_notes') ?? '').slice(0, 5000);
  if (!CONTACT_STATUSES.includes(status as never)) return { error: '対応状況が不正です' };
  if (assignedTo) {
    if (!UUID_RE.test(assignedTo)) return { error: '担当者が不正です' };
    const exists = await queryOne(
      'SELECT id FROM admin_users WHERE id = :id AND deleted_at IS NULL AND is_active = TRUE',
      { id: assignedTo },
    );
    if (!exists) return { error: '担当者が見つかりません' };
  }

  const current = await queryOne<{ status: string; assigned_to: string | null; admin_notes: string | null }>(
    'SELECT status, assigned_to, admin_notes FROM contacts WHERE id = :id AND deleted_at IS NULL',
    { id },
  );
  if (!current) return { error: '対象が見つかりません' };

  const diff: Record<string, unknown> = {};
  if (current.status !== status) diff.status = { from: current.status, to: status };
  if ((current.assigned_to ?? null) !== assignedTo) diff.assigned_to = { from: current.assigned_to, to: assignedTo };
  // メモの本文には個人情報が含まれうるので、操作ログには「変更した」ことだけ残す
  if ((current.admin_notes ?? '') !== notes) diff.admin_notes = 'changed';
  if (Object.keys(diff).length === 0) return { saved: true };

  await query(
    `UPDATE contacts SET status = :status, assigned_to = :assignedTo, admin_notes = :notes,
       responded_at = IF(:status = 'completed' AND responded_at IS NULL, UTC_TIMESTAMP(), responded_at)
     WHERE id = :id`,
    { status, assignedTo, notes: notes || null, id },
  );
  await writeAudit({ admin, action: 'contact.update', targetType: 'contact', targetId: id, diff });
  revalidatePath(`/contacts/${id}`);
  return { saved: true };
}
