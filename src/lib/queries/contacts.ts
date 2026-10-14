import 'server-only';
import { likeEscape, Params } from '../db';

export const CONTACT_STATUSES = ['pending', 'in_progress', 'completed', 'archived'] as const;

/** お問い合わせの種類 (サイトのお問い合わせフォームの選択肢と同じ) */
export const CONTACT_CATEGORIES = [
  'サービス掲載について',
  '掲載サービスに関するお問い合わせ',
  'サイトの使い方・不具合について',
  '業務提携・協業について',
  '取材・メディア掲載について',
  'その他',
] as const;

export type ContactFilter = { status?: string; category?: string; q?: string };

export function normalizeContactFilter(sp: Record<string, string | undefined>): ContactFilter {
  return {
    status: CONTACT_STATUSES.includes(sp.status as never) ? sp.status : undefined,
    category: CONTACT_CATEGORIES.includes(sp.category as never) ? sp.category : undefined,
    q: sp.q?.trim().slice(0, 100) || undefined,
  };
}

/** 一覧・CSV 共通の絞り込み条件 (値はすべてパラメーターで渡す) */
export function contactWhere(f: ContactFilter): { sql: string; params: Params } {
  const conds = ['c.deleted_at IS NULL', "c.route <> 'service'"];
  const params: Params = {};
  if (f.status) {
    conds.push('c.status = :status');
    params.status = f.status;
  }
  if (f.category) {
    conds.push('c.category = :category');
    params.category = f.category;
  }
  if (f.q) {
    conds.push('(c.reception_number = :qExact OR c.email LIKE :qLike OR c.name LIKE :qLike OR c.phone LIKE :qLike)');
    params.qExact = f.q.toUpperCase();
    params.qLike = `%${likeEscape(f.q)}%`;
  }
  return { sql: conds.join(' AND '), params };
}
