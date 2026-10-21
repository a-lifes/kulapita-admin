import type { Metadata } from 'next';
import { icons } from '@/components/icons';
import { MemberButton } from '@/components/MemberButton';
import { Pagination, pageFrom, perPageFrom } from '@/components/Pagination';
import { ClearButton, SearchButton, SearchForm } from '@/components/SearchForm';
import { SortableTh } from '@/components/SortableTh';
import { requireAdmin } from '@/lib/auth/guard';
import { query } from '@/lib/db';
import { hasRole } from '@/lib/adminUsers';
import { memberWhere, normalizeMemberFilter, PREFECTURES } from '@/lib/queries/members';
import { formatJst } from '@/lib/format';
import { MEMBER_COLUMNS, memberFromRow } from '@/lib/members';
import { orderBySql, resolveSort, SortColumn } from '@/lib/sort';
import { RelTime } from '@/components/RelTime';
import { ActiveFilters } from '@/components/ActiveFilters';

export const metadata: Metadata = { title: '会員' };

/**
 * 会員 (users): サイトに組合HP でログインした人。ログインしたことの無い人は載らない。
 * 名前・メール・住所などは、ログインやプレゼント応募のときに組合HP から受け取った内容。
 */
const SORT_COLUMNS: Record<string, SortColumn> = {
  member: { sql: 'u.external_id' },
  name: { sql: 'u.display_name' },
  prefecture: { sql: 'u.prefecture' },
  email: { sql: 'u.email' },
  first: { sql: 'u.first_authenticated_at', firstDir: 'desc' },
  last: { sql: 'u.last_login_at', firstDir: 'desc' },
};

type Row = Record<string, unknown> & { id: string };

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const filter = normalizeMemberFilter(sp);
  const { q, prefecture } = filter;
  const page = pageFrom(sp.page);
  const perPage = perPageFrom(sp.per);
  const sort = resolveSort(sp, SORT_COLUMNS, { key: 'last', dir: 'desc' });
  const listParams = { q, prefecture, per: sp.per };

  const { sql: where, params } = memberWhere(filter);

  const [{ rows }, { rows: count }] = await Promise.all([
    query<Row>(
      `SELECT u.id, ${MEMBER_COLUMNS} FROM users u
       WHERE ${where}
       ORDER BY ${orderBySql(SORT_COLUMNS, sort, 'u.id DESC')} LIMIT :limit OFFSET :offset`,
      { ...params, limit: perPage, offset: (page - 1) * perPage },
    ),
    query<{ total: number }>(`SELECT COUNT(*) AS total FROM users u WHERE ${where}`, params),
  ]);
  const total = Number(count[0]?.total ?? 0);
  const exportQuery = new URLSearchParams(Object.entries(filter).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <div className="list-page">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="page-title mb-0">会員</h1>
        {hasRole(admin.role, 'admin') && (
          <a className="btn-sub" title="CSV ファイルをダウンロード" href={`/api/export/members${exportQuery ? `?${exportQuery}` : ''}`}><icons.fileDownload className="h-4 w-4" />ダウンロード</a>
        )}
      </div>

      <SearchForm collapsible className="card mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="prefecture">都道府県</label>
          <select className="input" id="prefecture" name="prefecture" defaultValue={prefecture ?? ''}>
            <option value="">すべて</option>
            {PREFECTURES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <div className="min-w-64 flex-1">
          <label className="label" htmlFor="q">会員番号・名前・メール・電話</label>
          <input className="input" id="q" name="q" defaultValue={q ?? ''} />
        </div>
        <SearchButton />
        <ClearButton href="/members" />
      </SearchForm>
      <ActiveFilters basePath="/members" params={{ ...listParams, sort: sp.sort, dir: sp.dir }} chips={[{ key: 'prefecture', label: '都道府県', value: prefecture ?? '' }, { key: 'q', label: 'キーワード', value: q ?? '' }]} />

      <div className="card table-scroll">
        <table className="table">
          <thead>
            <tr>
              <SortableTh label="会員番号" sortKey="member" sort={sort} columns={SORT_COLUMNS} basePath="/members" params={listParams} />
              <SortableTh label="名前" sortKey="name" sort={sort} columns={SORT_COLUMNS} basePath="/members" params={listParams} />
              <SortableTh label="都道府県" sortKey="prefecture" sort={sort} columns={SORT_COLUMNS} basePath="/members" params={listParams} />
              <SortableTh label="メールアドレス" sortKey="email" sort={sort} columns={SORT_COLUMNS} basePath="/members" params={listParams} />
              <SortableTh label="初回ログイン日時" sortKey="first" sort={sort} columns={SORT_COLUMNS} basePath="/members" params={listParams} />
              <SortableTh label="最終ログイン日時" sortKey="last" sort={sort} columns={SORT_COLUMNS} basePath="/members" params={listParams} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const m = memberFromRow(r);
              if (!m) return null;
              return (
                <tr key={r.id}>
                  <td className="max-w-64 truncate">
                    <MemberButton
                      member={m}
                      formatted={{
                        first_authenticated_at: formatJst(m.first_authenticated_at),
                        last_login_at: formatJst(m.last_login_at),
                        profile_updated_at: formatJst(m.profile_updated_at),
                      }}
                    />
                  </td>
                  <td>{m.display_name ?? '—'}</td>
                  <td>{m.prefecture ?? '—'}</td>
                  <td>{m.email ?? '—'}</td>
                  <td><RelTime value={m.first_authenticated_at} /></td>
                  <td><RelTime value={m.last_login_at} /></td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-500">
                  {q || prefecture ? '検索内容に一致するデータはありません。' : 'ログインした会員はまだいません。'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination basePath="/members" params={{ ...listParams, sort: sort.key, dir: sort.dir }} page={page} perPage={perPage} total={total} />
    </div>
  );
}
