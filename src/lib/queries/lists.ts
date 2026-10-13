import 'server-only';
import { likeEscape, Params } from '../db';

export const NEWSLETTER_STATUSES = ['active', 'unsubscribed', 'bounced', 'pending'] as const;
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
export type PresentFilter = { campaign?: string; item?: string; status?: string };

export function normalizePresentFilter(sp: Record<string, string | undefined>): PresentFilter {
  const campaign = sp.campaign && /^[\w-]{1,32}$/.test(sp.campaign) ? sp.campaign : undefined;
  return {
    campaign,
    // 景品はキャンペーンごとの番号なので、キャンペーンを選んだときだけ使う
    item: campaign && sp.item && /^\d{1,2}$/.test(sp.item) ? sp.item : undefined,
    status: PRESENT_STATUSES.includes(sp.status as never) ? sp.status : undefined,
  };
}

export function presentWhere(f: PresentFilter): { sql: string; params: Params } {
  const conds = ['1 = 1'];
  const params: Params = {};
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
  return { sql: conds.join(' AND '), params };
}
