import 'server-only';
import { likeEscape, Params } from '../db';

export const CONTACT_STATUSES = ['pending', 'in_progress', 'completed', 'archived'] as const;
// サービスの申し込み (service) は service_applications で別に管理する
export const CONTACT_ROUTES = ['inquiry', 'publish'] as const;

export type ContactFilter = { status?: string; route?: string; q?: string };

export function normalizeContactFilter(sp: Record<string, string | undefined>): ContactFilter {
  return {
    status: CONTACT_STATUSES.includes(sp.status as never) ? sp.status : undefined,
    route: CONTACT_ROUTES.includes(sp.route as never) ? sp.route : undefined,
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
  if (f.route) {
    conds.push('c.route = :route');
    params.route = f.route;
  }
  if (f.q) {
    conds.push('(c.reception_number = :qExact OR c.email LIKE :qLike OR c.name LIKE :qLike OR c.phone LIKE :qLike)');
    params.qExact = f.q.toUpperCase();
    params.qLike = `%${likeEscape(f.q)}%`;
  }
  return { sql: conds.join(' AND '), params };
}
