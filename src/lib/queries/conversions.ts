import 'server-only';
import { likeEscape, Params } from '../db';
import { addDays, DateRange, jstStartAsUtc } from '../dateRange';
import { CASE_STATUSES } from '../caseStatus';

/* ── コンバージョン（申し込み）: service_applications ── */

export type ApplicationFilter = { status?: string; service?: string; q?: string };

export function normalizeApplicationFilter(sp: Record<string, string | undefined>): ApplicationFilter {
  return {
    status: CASE_STATUSES.includes(sp.status as never) ? sp.status : undefined,
    service: sp.service?.trim().slice(0, 200) || undefined,
    q: sp.q?.trim().slice(0, 100) || undefined,
  };
}

/** 一覧・CSV 共通の絞り込み条件 */
export function applicationWhere(f: ApplicationFilter): { sql: string; params: Params } {
  const conds = ['s.deleted_at IS NULL'];
  const params: Params = {};
  if (f.status) {
    conds.push('s.status = :status');
    params.status = f.status;
  }
  if (f.service) {
    conds.push('s.service_name = :service');
    params.service = f.service;
  }
  if (f.q) {
    conds.push('(s.reception_number = :qExact OR s.email LIKE :qLike OR s.name LIKE :qLike OR s.phone LIKE :qLike)');
    params.qExact = f.q.toUpperCase();
    params.qLike = `%${likeEscape(f.q)}%`;
  }
  return { sql: conds.join(' AND '), params };
}

/* ── コンバージョン（誘導）: outbound_clicks ── */

export const PLACEMENTS = ['hero', 'fixed'] as const;

export type ClickFilter = { service?: string; placement?: string };

export function normalizeClickFilter(sp: Record<string, string | undefined>): ClickFilter {
  return {
    service: sp.service?.trim().slice(0, 200) || undefined,
    placement: PLACEMENTS.includes(sp.placement as never) ? sp.placement : undefined,
  };
}

/** 期間 + 絞り込み条件 (期間は日本時間の日付で指定) */
export function clickWhere(f: ClickFilter, range: DateRange): { sql: string; params: Params } {
  const conds = ['k.created_at >= :start', 'k.created_at < :end'];
  const params: Params = { start: jstStartAsUtc(range.from), end: jstStartAsUtc(addDays(range.to, 1)) };
  if (f.service) {
    conds.push('k.service_slug = :service');
    params.service = f.service;
  }
  if (f.placement) {
    conds.push('k.placement = :placement');
    params.placement = f.placement;
  }
  return { sql: conds.join(' AND '), params };
}
