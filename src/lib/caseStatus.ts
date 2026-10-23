import 'server-only';
import { revalidatePath } from 'next/cache';
import { writeAudit } from './audit';
import { requireAdmin } from './auth/guard';
import { query, queryOne } from './db';
import { UUID_RE } from './uuid';
import { APPLICATION_STATUSES } from './format';

/**
 * お問い合わせ・サービスの申し込みに共通の「対応状況・担当者・対応メモ」の更新。
 * (テーブル名は呼び出し元で固定の値だけを渡す)
 */
export type CaseFormState = { error?: string; saved?: boolean } | undefined;
/** お問い合わせの対応状況 (申し込みは format.ts の APPLICATION_STATUSES) */
export const CASE_STATUSES = ['pending', 'in_progress', 'completed', 'archived'] as const;
/** 対応が終わった状態 (対応完了日時を記録する) */
const DONE_STATUSES = ['completed', 'contracted', 'lost'];

/**
 * お問い合わせ・申し込みの一覧で、左の 3 列 (受付日時・受付番号・対応状況) を同じ固定幅にする。
 * 対応状況はお問い合わせの一覧でプルダウンになるので、その幅に合わせる。
 * 両方の画面で列の位置がそろう (残りの幅は右側の列に回る)。
 */
export const CASE_COLUMN_WIDTH = {
  created: 'w-40 min-w-40 max-w-40',
  number: 'w-28 min-w-28 max-w-28',
  status: 'w-44 min-w-44 max-w-44',
} as const;

export async function updateCaseStatus(input: {
  table: 'contacts' | 'service_applications';
  auditAction: string;
  targetType: string;
  detailPath: string;
  id: string;
  formData: FormData;
}): Promise<CaseFormState> {
  const admin = await requireAdmin('support');
  const { table, id, formData } = input;
  if (!UUID_RE.test(id)) return { error: '対象が見つかりません' };

  const status = String(formData.get('status') ?? '');
  const assignedTo = String(formData.get('assigned_to') ?? '') || null;
  const notes = String(formData.get('admin_notes') ?? '').slice(0, 5000);
  const allowed: readonly string[] = table === 'service_applications' ? APPLICATION_STATUSES : CASE_STATUSES;
  if (!allowed.includes(status)) return { error: '対応状況が不正です' };
  if (assignedTo) {
    if (!UUID_RE.test(assignedTo)) return { error: '担当者が不正です' };
    const exists = await queryOne(
      'SELECT id FROM admin_users WHERE id = :id AND deleted_at IS NULL AND is_active = TRUE',
      { id: assignedTo },
    );
    if (!exists) return { error: '担当者が見つかりません' };
  }

  const current = await queryOne<{ status: string; assigned_to: string | null; admin_notes: string | null }>(
    `SELECT status, assigned_to, admin_notes FROM ${table} WHERE id = :id AND deleted_at IS NULL`,
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
    `UPDATE ${table} SET status = :status, assigned_to = :assignedTo, admin_notes = :notes,
       responded_at = IF(:done AND responded_at IS NULL, UTC_TIMESTAMP(), responded_at)
     WHERE id = :id`,
    { status, assignedTo, notes: notes || null, id, done: DONE_STATUSES.includes(status) },
  );
  await writeAudit({ admin, action: input.auditAction, targetType: input.targetType, targetId: id, diff });
  revalidatePath(input.detailPath);
  // 一覧 (右側のパネルで開いているときの後ろの一覧) も最新にする
  revalidatePath(input.table === 'contacts' ? '/contacts' : '/applications');
  return { saved: true };
}
