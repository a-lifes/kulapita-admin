import 'server-only';
import { likeEscape, Params } from '../db';

export const NEWSLETTER_STATUSES = ['pending', 'registered', 'excluded'] as const;
export type NewsletterFilter = { status?: string; q?: string };

export function normalizeNewsletterFilter(sp: Record<string, string | undefined>): NewsletterFilter {
  return {
    status: NEWSLETTER_STATUSES.includes(sp.status as never) ? sp.status : undefined,
    q: sp.q?.trim().slice(0, 100) || undefined,
  };
}

export function newsletterWhere(f: NewsletterFilter): { sql: string; params: Params } {
  const conds = ['n.deleted_at IS NULL'];
  const params: Params = {};
  if (f.status) {
    conds.push('n.status = :status');
    params.status = f.status;
  }
  if (f.q) {
    conds.push("(n.email LIKE :q OR CONCAT(IFNULL(n.last_name, ''), IFNULL(n.first_name, '')) LIKE :q)");
    params.q = `%${likeEscape(f.q)}%`;
  }
  return { sql: conds.join(' AND '), params };
}

export const PRESENT_STATUSES = ['applied', 'won', 'lost'] as const;
export type PresentFilter = {
  campaign?: string;
  /** 開催月の指定が不正 (形が合わない)。絞り込みを外して全月を出さないよう、何も出さない */
  campaignInvalid?: boolean;
  item?: string;
  status?: string;
  q?: string;
};

export function normalizePresentFilter(sp: Record<string, string | undefined>): PresentFilter {
  // キャンペーンは microCMS のコンテンツ ID (応募の記録と同じ形: 半角英数字・ハイフン・アンダースコアで 64 文字まで)
  const campaign = sp.campaign && /^[A-Za-z0-9_-]{1,64}$/.test(sp.campaign) ? sp.campaign : undefined;
  return {
    campaign,
    campaignInvalid: Boolean(sp.campaign) && !campaign ? true : undefined,
    // 景品はキャンペーンごとの番号なので、キャンペーンを選んだときだけ使う
    item: campaign && sp.item && /^\d{1,2}$/.test(sp.item) ? sp.item : undefined,
    status: PRESENT_STATUSES.includes(sp.status as never) ? sp.status : undefined,
    q: sp.q?.trim().slice(0, 100) || undefined,
  };
}

export function presentWhere(f: PresentFilter): { sql: string; params: Params } {
  const conds = ['1 = 1'];
  const params: Params = {};
  if (f.campaignInvalid) conds.push('1 = 0');
  if (f.campaign) {
    conds.push('p.campaign_key = :campaign');
    params.campaign = f.campaign;
  }
  if (f.item) {
    conds.push('p.item_index = :item');
    params.item = Number(f.item);
  }
  if (f.status) {
    conds.push('p.status = :status');
    params.status = f.status;
  }
  // フリーワード: 会員番号・名前・メール (応募時のメール・会員のメール)。users を u として JOIN しておくこと
  if (f.q) {
    conds.push('(u.external_id = :qExact OR u.display_name LIKE :qLike OR p.email LIKE :qLike OR u.email LIKE :qLike)');
    params.qExact = f.q;
    params.qLike = `%${likeEscape(f.q)}%`;
  }
  return { sql: conds.join(' AND '), params };
}
