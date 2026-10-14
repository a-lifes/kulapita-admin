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

export type BulkResult = { ok: true; updated: number } | { ok: false; error: string };

/** 一度に設定できる件数 (一覧の表示件数の上限と同じ) */
const BULK_MAX = 100;

/**
 * 選んだ応募の結果をまとめて設定する。
 * 当選にするときは、景品ごとに「選んだ応募以外の当選数 + 新しく当選にする数」が当選者数を超えないか先に確かめ、
 * 超える景品が 1 つでもあれば何も更新しない。
 */
export async function setPresentStatusBulkAction(ids: string[], status: string): Promise<BulkResult> {
  const admin = await requireAdmin('support');
  const uniq = [...new Set(ids)];
  if (uniq.length === 0) return { ok: false, error: '応募を選んでください' };
  if (uniq.length > BULK_MAX) return { ok: false, error: `一度に設定できるのは ${BULK_MAX} 件までです` };
  if (!uniq.every((id) => UUID_RE.test(id)) || !PRESENT_STATUSES.includes(status as never)) {
    return { ok: false, error: '指定が不正です' };
  }

  const idParams: Record<string, string> = {};
  uniq.forEach((id, i) => (idParams[`id${i}`] = id));
  const inList = uniq.map((_, i) => `:id${i}`).join(', ');

  const { rows: apps } = await query<{ id: string; campaign_key: string; item_index: number; item_name: string; status: string }>(
    `SELECT id, campaign_key, item_index, item_name, status FROM present_applications WHERE id IN (${inList})`,
    idParams,
  );
  if (apps.length === 0) return { ok: false, error: '応募が見つかりません' };
  const targets = apps.filter((a) => a.status !== status);
  if (targets.length === 0) return { ok: true, updated: 0 };

  if (status === 'won') {
    // 景品ごとにまとめて当選者数を確かめる
    const groups = new Map<string, { campaign: string; item: number; name: string; adding: number }>();
    for (const a of targets) {
      const key = `${a.campaign_key}:${a.item_index}`;
      const g = groups.get(key) ?? { campaign: a.campaign_key, item: Number(a.item_index), name: a.item_name, adding: 0 };
      g.adding += 1;
      groups.set(key, g);
    }
    const cmsCache = new Map<string, Awaited<ReturnType<typeof getCampaignItems>>>();
    for (const g of groups.values()) {
      if (!cmsCache.has(g.campaign)) cmsCache.set(g.campaign, await getCampaignItems(g.campaign));
      const { items, error } = cmsCache.get(g.campaign)!;
      const winners = items?.[g.item]?.winners;
      if (winners === null || winners === undefined) {
        return {
          ok: false,
          error: `「${g.name}」の当選者数がわからないため当選にできません（${error ?? '景品に当選人数が設定されていません'}）`,
        };
      }
      const current = await queryOne<{ n: number }>(
        `SELECT COUNT(*) AS n FROM present_applications
         WHERE campaign_key = :campaign AND item_index = :item AND status = 'won'`,
        { campaign: g.campaign, item: g.item },
      );
      const won = Number(current?.n ?? 0);
      if (won + g.adding > winners) {
        return {
          ok: false,
          error: `「${g.name}」は当選者数 ${winners} 名に対して、すでに ${won} 名が当選です。あと ${Math.max(0, winners - won)} 名まで当選にできます（選択中 ${g.adding} 名）`,
        };
      }
    }
  }

  const targetParams: Record<string, string> = { status };
  targets.forEach((a, i) => (targetParams[`t${i}`] = a.id));
  const { affected } = await query(
    `UPDATE present_applications SET status = :status WHERE id IN (${targets.map((_, i) => `:t${i}`).join(', ')})`,
    targetParams,
  );

  await writeAudit({
    admin,
    action: 'present.bulk_update_status',
    targetType: 'present_application',
    diff: {
      status,
      count: affected,
      items: [...new Set(targets.map((a) => `${a.campaign_key} ${Number(a.item_index) + 1}. ${a.item_name}`))],
      ids: targets.map((a) => a.id),
    },
  });
  revalidatePath('/presents');
  return { ok: true, updated: affected };
}
