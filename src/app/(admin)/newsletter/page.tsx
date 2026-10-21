import type { Metadata } from 'next';
import { icons } from '@/components/icons';
import { Pagination, pageFrom, perPageFrom } from '@/components/Pagination';
import { BulkProvider, BulkStatusBar, RowCheckbox, SelectAllCheckbox } from '@/components/BulkStatus';
import { MemberButton } from '@/components/MemberButton';
import { StatusSelect } from '@/components/StatusSelect';
import { MEMBER_COLUMNS, memberFromRow } from '@/lib/members';
import { setNewsletterStatusAction, setNewsletterStatusBulkAction } from './actions';
import { hasRole } from '@/lib/adminUsers';
import { requireAdmin } from '@/lib/auth/guard';
import { query } from '@/lib/db';
import { formatJst, NEWSLETTER_STATUS_LABEL, NEWSLETTER_STATUS_STYLE } from '@/lib/format';
import { NEWSLETTER_STATUSES, newsletterWhere, normalizeNewsletterFilter } from '@/lib/queries/lists';
import { ClearButton, SearchButton, SearchForm } from '@/components/SearchForm';
import { SortableTh } from '@/components/SortableTh';
import { orderBySql, resolveSort, SortColumn } from '@/lib/sort';
import { RelTime } from '@/components/RelTime';
import { ActiveFilters } from '@/components/ActiveFilters';

export const metadata: Metadata = { title: 'メルマガ' };

/** 並べ替えできる列 */
const SORT_COLUMNS: Record<string, SortColumn> = {
  subscribed: { sql: 'n.subscribed_at', firstDir: 'desc' },
  email: { sql: 'n.email' },
  name: { sql: "CONCAT(IFNULL(n.last_name, ''), IFNULL(n.first_name, ''))" },
  member: { sql: 'COALESCE(u.display_name, u.external_id)' },
  status: { sql: "FIELD(n.status, 'pending', 'registered', 'excluded')" },
};

type Row = Record<string, unknown> & {
  id: string;
  email: string;
  last_name: string | null;
  first_name: string | null;
  status: string;
  subscribed_at: string;
};

export default async function NewsletterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const filter = normalizeNewsletterFilter(sp);
  const page = pageFrom(sp.page);
  const perPage = perPageFrom(sp.per);
  const where = newsletterWhere(filter);
  const sort = resolveSort(sp, SORT_COLUMNS, { key: 'subscribed', dir: 'desc' });
  const listParams = { ...filter, per: sp.per };

  const [{ rows }, { rows: count }] = await Promise.all([
    query<Row>(
      `SELECT n.id, n.email, n.last_name, n.first_name, n.status, n.subscribed_at, ${MEMBER_COLUMNS}
       FROM newsletter_subscribers n LEFT JOIN users u ON u.id = n.user_id
       WHERE ${where.sql}
       ORDER BY ${orderBySql(SORT_COLUMNS, sort, 'n.id DESC')} LIMIT :limit OFFSET :offset`,
      { ...where.params, limit: perPage, offset: (page - 1) * perPage },
    ),
    query<{ total: number }>(`SELECT COUNT(*) AS total FROM newsletter_subscribers n WHERE ${where.sql}`, where.params),
  ]);
  const total = Number(count[0]?.total ?? 0);
  const canEdit = hasRole(admin.role, 'support');
  const exportQuery = new URLSearchParams(Object.entries(filter).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <div className="list-page">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="page-title mb-0">メルマガ</h1>
        {hasRole(admin.role, 'admin') && (
          <a className="btn-sub" title="CSV ファイルをダウンロード" href={`/api/export/newsletter${exportQuery ? `?${exportQuery}` : ''}`}><icons.fileDownload className="h-4 w-4" />ダウンロード</a>
        )}
      </div>
      <SearchForm collapsible className="card mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="status">状態</label>
          <select className="input" id="status" name="status" defaultValue={filter.status ?? ''}>
            <option value="">すべて</option>
            {NEWSLETTER_STATUSES.map((s) => (
              <option key={s} value={s}>{NEWSLETTER_STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>
        <div className="min-w-64 flex-1">
          <label className="label" htmlFor="q">メール・お名前</label>
          <input className="input" id="q" name="q" defaultValue={filter.q ?? ''} placeholder="例）yamada@example.com、山田" />
        </div>
        <SearchButton />
        <ClearButton href="/newsletter" />
      </SearchForm>
      <ActiveFilters basePath="/newsletter" params={{ ...listParams, sort: sp.sort, dir: sp.dir }} chips={[{ key: 'status', label: '状態', value: filter.status ? NEWSLETTER_STATUS_LABEL[filter.status] : '' }, { key: 'q', label: 'キーワード', value: filter.q ?? '' }]} />
      <BulkProvider ids={rows.map((r) => r.id)}>
        {canEdit && (
          <BulkStatusBar
            labels={NEWSLETTER_STATUS_LABEL}
            action={setNewsletterStatusBulkAction}
            field="状態"
            noun="登録"
            defaultStatus="registered"
          />
        )}
        <div className="card table-scroll">
          <table className="table">
            <thead>
              <tr>
                {canEdit && (
                  <th className="w-10">
                    <SelectAllCheckbox />
                  </th>
                )}
                <SortableTh label="登録日時" sortKey="subscribed" sort={sort} columns={SORT_COLUMNS} basePath="/newsletter" params={listParams} />
                <SortableTh label="メール" sortKey="email" sort={sort} columns={SORT_COLUMNS} basePath="/newsletter" params={listParams} />
                <SortableTh label="状態" sortKey="status" sort={sort} columns={SORT_COLUMNS} basePath="/newsletter" params={listParams} />
                <SortableTh label="お名前" sortKey="name" sort={sort} columns={SORT_COLUMNS} basePath="/newsletter" params={listParams} />
                <SortableTh label="会員" sortKey="member" sort={sort} columns={SORT_COLUMNS} basePath="/newsletter" params={listParams} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const member = memberFromRow(r);
                return (
                  <tr key={r.id}>
                    {canEdit && (
                      <td className="w-10">
                        <RowCheckbox id={r.id} />
                      </td>
                    )}
                    <td><RelTime value={r.subscribed_at} /></td>
                    <td>{r.email}</td>
                    <td>
                      <StatusSelect
                        key={r.status}
                        id={r.id}
                        status={r.status}
                        readOnly={!canEdit}
                        labels={NEWSLETTER_STATUS_LABEL}
                        styles={NEWSLETTER_STATUS_STYLE}
                        action={setNewsletterStatusAction}
                        ariaLabel="メルマガの状態"
                      />
                    </td>
                    <td>{[r.last_name, r.first_name].filter(Boolean).join(' ') || '—'}</td>
                    <td>
                      {member ? (
                        <MemberButton
                          member={member}
                          label={member.display_name ?? member.external_id}
                          formatted={{
                            first_authenticated_at: formatJst(member.first_authenticated_at),
                            last_login_at: formatJst(member.last_login_at),
                            profile_updated_at: formatJst(member.profile_updated_at),
                          }}
                        />
                      ) : (
                        <span className="text-slate-400">ログインなし</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={canEdit ? 6 : 5} className="py-8 text-center text-slate-500">{filter.status || filter.q ? '検索内容に一致するデータはありません。' : 'メルマガの登録者はまだいません。'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </BulkProvider>
      <Pagination basePath="/newsletter" params={{ ...listParams, sort: sort.key, dir: sort.dir }} page={page} perPage={perPage} total={total} />
    </div>
  );
}
