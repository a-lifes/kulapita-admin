'use server';

import { randomInt } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { writeAudit } from '@/lib/audit';
import { requireAdmin } from '@/lib/auth/guard';
import { isLockConflictError, query, withTransaction } from '@/lib/db';
import { getCampaignItems } from '@/lib/microcms';
import { UUID_RE } from '@/lib/uuid';

/**
 * プレゼントの自動当選 (抽選)。
 *
 * 1. previewAutoDrawAction … 条件に合わせて景品ごとに当選者を選び、結果を返すだけ (DB は変えない)
 * 2. applyAutoDrawAction   … 画面で確認した結果を反映する。当選者を「当選」、残りの応募中を「落選」にする
 *
 * 条件 (組み合わせ可):
 *   frequent    … 応募回数が多い人の当選確率を上げる (このキャンペーン以外への応募 1 回ごとに重みを +1)
 *   early       … 応募時期が早い人の当選確率を上げる (その景品で 1 番目の応募は重み 2 倍、最後は 1 倍)
 *   excludePast … 過去に当選した会員は除く (このキャンペーン以外で当選したことがある会員)
 * 重み付きの抽選は、重みに比例して選ばれやすくする (重みが 2 倍なら選ばれる確率もおよそ 2 倍)。
 *
 * 景品ごとに「応募数が当選者数に満たない」ときは使えない (全員当選で抽選の必要がないため)。
 * すでに当選にしている応募はそのまま残し、当選者数の残りの枠だけを選ぶ。
 */
export type DrawConditions = { frequent: boolean; early: boolean; excludePast: boolean };

export type DrawWinner = { id: string; name: string; memberId: string | null; appliedAt: string; pastApplied: number; pastWon: number };
export type DrawItemPlan = {
  index: number;
  name: string;
  winners: number;
  alreadyWon: number;
  /** 今回の抽選の対象になった応募の数 (応募中で、条件で除かれなかったもの) */
  candidates: number;
  /** 条件「過去に当選実績のある会員は除く」で除いた数 */
  excluded: number;
  picked: DrawWinner[];
  /** 落選にする数 (応募中のうち、当選に選ばれなかったもの) */
  losing: number;
};
export type DrawPreview = { ok: true; items: DrawItemPlan[]; shortage: string[] } | { ok: false; error: string };

type Candidate = {
  id: string;
  item_index: number;
  status: string;
  created_at: string;
  user_id: string | null;
  display_name: string | null;
  external_id: string | null;
};

/** 0 以上 1 未満の乱数 (暗号用の乱数を使う。Math.random より偏りが少なく予測もしにくい) */
function random(): number {
  return randomInt(0, 2 ** 48 - 1) / 2 ** 48;
}

/**
 * 重み付きで k 件を重複なく選ぶ (Efraimidis–Spirakis 法)。
 * 各候補に「乱数 ^ (1 / 重み)」の値をつけ、大きい順に k 件とる。重みが大きいほど選ばれやすい。
 */
function weightedSample<T>(items: { value: T; weight: number }[], k: number): T[] {
  return items
    .map((x) => ({ value: x.value, key: Math.pow(Math.max(random(), Number.EPSILON), 1 / x.weight) }))
    .sort((a, b) => b.key - a.key)
    .slice(0, k)
    .map((x) => x.value);
}

const CAMPAIGN_RE = /^[A-Za-z0-9_-]{1,64}$/;

export async function previewAutoDrawAction(campaign: string, conditions: DrawConditions): Promise<DrawPreview> {
  await requireAdmin('support');
  if (!CAMPAIGN_RE.test(campaign)) return { ok: false, error: 'キャンペーンの指定が不正です' };
  const cond = { frequent: !!conditions.frequent, early: !!conditions.early, excludePast: !!conditions.excludePast };

  const { items, error } = await getCampaignItems(campaign);
  if (!items) return { ok: false, error: `当選者数がわからないため自動当選できません（${error ?? ''}）` };
  if (items.some((i) => i.winners === null)) {
    return { ok: false, error: '当選者数が設定されていない景品があるため、自動当選できません' };
  }

  const [{ rows: apps }, { rows: past }] = await Promise.all([
    query<Candidate>(
      `SELECT p.id, p.item_index, p.status, p.created_at, p.user_id, u.display_name, u.external_id
       FROM present_applications p LEFT JOIN users u ON u.id = p.user_id
       WHERE p.campaign_key = :campaign ORDER BY p.created_at, p.id`,
      { campaign },
    ),
    // このキャンペーンに応募した会員の、ほかのキャンペーンでの応募数・当選数
    query<{ user_id: string; applied: number; won: number }>(
      `SELECT user_id, COUNT(*) AS applied, SUM(status = 'won') AS won FROM present_applications
       WHERE campaign_key <> :campaign
         AND user_id IN (SELECT user_id FROM present_applications WHERE campaign_key = :campaign)
       GROUP BY user_id`,
      { campaign },
    ),
  ]);
  const pastByUser = new Map(past.map((r) => [r.user_id, { applied: Number(r.applied), won: Number(r.won ?? 0) }]));

  // 応募数が当選者数に満たない景品があれば使えない
  const short = items
    .map((item, index) => ({ item, index, count: apps.filter((a) => Number(a.item_index) === index).length }))
    .filter((x) => x.count < (x.item.winners ?? 0));
  if (short.length > 0) {
    return {
      ok: false,
      error: `応募数が当選者数に満たない景品があるため、自動当選は使えません（${short
        .map((x) => `${x.index + 1}. ${x.item.name}：応募 ${x.count} 件 / 当選者数 ${x.item.winners} 名`)
        .join('、')}）`,
    };
  }

  const plans: DrawItemPlan[] = [];
  const shortage: string[] = [];
  items.forEach((item, index) => {
    const all = apps.filter((a) => Number(a.item_index) === index);
    const alreadyWon = all.filter((a) => a.status === 'won').length;
    const open = all.filter((a) => a.status === 'applied');
    const eligible = cond.excludePast ? open.filter((a) => !(a.user_id && (pastByUser.get(a.user_id)?.won ?? 0) > 0)) : open;
    const slots = Math.max(0, (item.winners ?? 0) - alreadyWon);
    // 応募が早い順の順位 (0 始まり)。この景品の応募全体の中での順番
    const rank = new Map(all.map((a, i) => [a.id, i]));
    const last = Math.max(1, all.length - 1);
    const weighted = eligible.map((a) => {
      let weight = 1;
      if (cond.frequent) weight *= 1 + (a.user_id ? (pastByUser.get(a.user_id)?.applied ?? 0) : 0);
      if (cond.early) weight *= 2 - (rank.get(a.id) ?? last) / last;
      return { value: a, weight };
    });
    const picked = weightedSample(weighted, slots);
    if (picked.length < slots) {
      shortage.push(`${index + 1}. ${item.name}：当選者数の残り ${slots} 名に対して、対象者が ${picked.length} 名`);
    }
    plans.push({
      index,
      name: item.name,
      winners: item.winners ?? 0,
      alreadyWon,
      candidates: eligible.length,
      excluded: open.length - eligible.length,
      picked: picked.map((a) => ({
        id: a.id,
        name: a.display_name || '（名前なし）',
        memberId: a.external_id,
        appliedAt: a.created_at,
        pastApplied: a.user_id ? (pastByUser.get(a.user_id)?.applied ?? 0) : 0,
        pastWon: a.user_id ? (pastByUser.get(a.user_id)?.won ?? 0) : 0,
      })),
      losing: open.length - picked.length,
    });
  });
  return { ok: true, items: plans, shortage };
}

export type DrawApplyResult = { ok: true; won: number; lost: number } | { ok: false; error: string };

/**
 * 確認した抽選結果を反映する。景品ごとに応募をロックしてから、
 * ・選んだ応募がまだ「応募中」であること
 * ・すでに当選の数 + 今回の当選 が当選者数を超えないこと
 * を確かめ、すべての景品で問題がなければ、選んだ応募を「当選」、残りの「応募中」を「落選」にする。
 * 確認から反映までの間にほかの人が結果を変えていたら、何も変えずにやり直してもらう。
 */
export async function applyAutoDrawAction(
  campaign: string,
  plan: { index: number; winnerIds: string[] }[],
  conditions: DrawConditions,
): Promise<DrawApplyResult> {
  const admin = await requireAdmin('support');
  if (!CAMPAIGN_RE.test(campaign)) return { ok: false, error: 'キャンペーンの指定が不正です' };
  if (!Array.isArray(plan) || plan.length === 0 || plan.length > 50) return { ok: false, error: '抽選結果が不正です' };
  for (const p of plan) {
    if (!Number.isInteger(p.index) || p.index < 0 || p.index > 50) return { ok: false, error: '抽選結果が不正です' };
    if (!Array.isArray(p.winnerIds) || p.winnerIds.length > 1000 || !p.winnerIds.every((id) => UUID_RE.test(id))) {
      return { ok: false, error: '抽選結果が不正です' };
    }
  }
  const { items, error } = await getCampaignItems(campaign);
  if (!items) return { ok: false, error: `当選者数がわからないため反映できません（${error ?? ''}）` };

  const ordered = [...plan].sort((a, b) => a.index - b.index);
  let result: DrawApplyResult;
  try {
    result = await withTransaction(async (tx) => {
      // 1. すべての景品をロックして確かめる (この間は何も書き換えない)
      for (const p of ordered) {
        const winners = items[p.index]?.winners;
        if (winners === null || winners === undefined) return { ok: false as const, error: '当選者数がわからない景品があります' };
        const { rows } = await tx.query<{ id: string; status: string }>(
          `SELECT id, status FROM present_applications
           WHERE campaign_key = :campaign AND item_index = :item ORDER BY id FOR UPDATE`,
          { campaign, item: p.index },
        );
        const byId = new Map(rows.map((r) => [r.id, r.status]));
        const won = rows.filter((r) => r.status === 'won').length;
        if (!p.winnerIds.every((id) => byId.get(id) === 'applied') || won + p.winnerIds.length > winners) {
          return { ok: false as const, error: '抽選のあとに結果が変更されたため反映できませんでした。もう一度抽選してください' };
        }
      }
      // 2. 当選・落選にする
      let wonCount = 0;
      let lostCount = 0;
      for (const p of ordered) {
        const params: Record<string, string | number> = { campaign, item: p.index };
        p.winnerIds.forEach((id, i) => (params[`w${i}`] = id));
        const inList = p.winnerIds.map((_, i) => `:w${i}`).join(', ');
        if (p.winnerIds.length > 0) {
          wonCount += (
            await tx.query(`UPDATE present_applications SET status = 'won' WHERE id IN (${inList})`, params)
          ).affected;
        }
        lostCount += (
          await tx.query(
            `UPDATE present_applications SET status = 'lost'
             WHERE campaign_key = :campaign AND item_index = :item AND status = 'applied'
             ${p.winnerIds.length > 0 ? `AND id NOT IN (${inList})` : ''}`,
            params,
          )
        ).affected;
      }
      return { ok: true as const, won: wonCount, lost: lostCount };
    });
  } catch (e) {
    if (isLockConflictError(e)) return { ok: false, error: 'ほかの人の操作と重なったため反映できませんでした。もう一度お試しください' };
    throw e;
  }
  if (!result.ok) return result;

  await writeAudit({
    admin,
    action: 'present.auto_draw',
    targetType: 'present_campaign',
    diff: {
      campaign,
      conditions: { frequent: !!conditions?.frequent, early: !!conditions?.early, excludePast: !!conditions?.excludePast },
      won: result.won,
      lost: result.lost,
      items: ordered.map((p) => ({ item: p.index + 1, won: p.winnerIds.length })),
    },
  });
  revalidatePath('/presents');
  return result;
}

export type DrawResetResult = { ok: true; reset: number } | { ok: false; error: string };

/**
 * 初期化: このキャンペーンの応募の結果 (当選・落選) をすべて「応募中」に戻す。
 * 自動当選をやり直したいときなどに使う。当選メールの送信記録 (notified_at) は消さない。
 */
export async function resetDrawAction(campaign: string): Promise<DrawResetResult> {
  const admin = await requireAdmin('support');
  if (!CAMPAIGN_RE.test(campaign)) return { ok: false, error: 'キャンペーンの指定が不正です' };
  let reset: number;
  try {
    reset = await withTransaction(async (tx) => {
      // 当選の操作と重ならないよう、自動当選・当選と同じくロックしてから戻す
      await tx.query('SELECT id FROM present_applications WHERE campaign_key = :campaign ORDER BY id FOR UPDATE', {
        campaign,
      });
      return (
        await tx.query(
          "UPDATE present_applications SET status = 'applied' WHERE campaign_key = :campaign AND status <> 'applied'",
          { campaign },
        )
      ).affected;
    });
  } catch (e) {
    if (isLockConflictError(e)) return { ok: false, error: 'ほかの人の操作と重なったため初期化できませんでした。もう一度お試しください' };
    throw e;
  }
  await writeAudit({ admin, action: 'present.reset_results', targetType: 'present_campaign', diff: { campaign, reset } });
  revalidatePath('/presents');
  return { ok: true, reset };
}
