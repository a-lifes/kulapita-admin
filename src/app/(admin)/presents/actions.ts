'use server';

import { revalidatePath } from 'next/cache';
import { writeAudit } from '@/lib/audit';
import { requireAdmin } from '@/lib/auth/guard';
import { query, queryOne } from '@/lib/db';
import { getCampaignItems } from '@/lib/microcms';
import { PRESENT_STATUSES } from '@/lib/queries/lists';
import { UUID_RE } from '@/lib/uuid';

export type StatusResult = { ok: true; status: string } | { ok: false; error: string };

/**
 * 応募の結果 (応募 / 当選 / 落選) を設定する。あとから何度でも変更できる。
 * 当選は、景品ごとの当選者数 (microCMS の winners) を超えて設定できない。
 */
export async function setPresentStatusAction(id: string, status: string): Promise<StatusResult> {
  const admin = await requireAdmin('support');
  if (!UUID_RE.test(id) || !PRESENT_STATUSES.includes(status as never)) {
    return { ok: false, error: '指定が不正です' };
  }
  const app = await queryOne<{ campaign_key: string; item_index: number; status: string }>(
    'SELECT campaign_key, item_index, status FROM present_applications WHERE id = :id',
    { id },
  );
  if (!app) return { ok: false, error: '応募が見つかりません' };
  if (app.status === status) return { ok: true, status };
  const itemIndex = Number(app.item_index);

  let affected: number;
  if (status === 'won') {
    const { items, error } = await getCampaignItems(app.campaign_key);
    const winners = items?.[itemIndex]?.winners;
    if (winners === null || winners === undefined) {
      return { ok: false, error: `当選者数がわからないため当選にできません（${error ?? '景品に当選人数が設定されていません'}）` };
    }
    // 「この応募以外の当選数 < 当選者数」のときだけ更新する (同時に操作されても超えないよう 1 文で判定)
    // ※ MySQL は UPDATE 対象と同じ表をサブクエリで直接参照できないため、派生表で包む
    ({ affected } = await query(
      `UPDATE present_applications SET status = 'won'
       WHERE id = :id AND (
         SELECT n FROM (
           SELECT COUNT(*) AS n FROM present_applications
           WHERE campaign_key = :campaign AND item_index = :item AND status = 'won' AND id <> :id
         ) AS t
       ) < :winners`,
      { id, campaign: app.campaign_key, item: itemIndex, winners },
    ));
    if (affected === 0) {
      return { ok: false, error: `この景品の当選者数（${winners} 名）に達しているため、これ以上当選にできません` };
    }
  } else {
    ({ affected } = await query('UPDATE present_applications SET status = :status WHERE id = :id', { id, status }));
  }

  await writeAudit({
    admin,
    action: 'present.update_status',
    targetType: 'present_application',
    targetId: id,
    diff: { campaign: app.campaign_key, item: itemIndex + 1, status: { from: app.status, to: status } },
  });
  revalidatePath('/presents');
  return { ok: true, status };
}
