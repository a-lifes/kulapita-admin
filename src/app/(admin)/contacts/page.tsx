import type { Metadata } from 'next';
import { icons } from '@/components/icons';
import { MemberButton } from '@/components/MemberButton';
import { Pagination, pageFrom, perPageFrom } from '@/components/Pagination';
import { StatusBadge } from '@/components/StatusBadge';
import { StatusSelect } from '@/components/StatusSelect';
import { BulkProvider, BulkStatusBar, RowCheckbox, SelectAllCheckbox } from '@/components/BulkStatus';
import { setContactStatusAction, setContactStatusBulkAction } from './actions';
import { hasRole } from '@/lib/adminUsers';
import { requireAdmin } from '@/lib/auth/guard';
import { CASE_COLUMN_WIDTH } from '@/lib/caseStatus';
import { query } from '@/lib/db';
import { MEMBER_COLUMNS, memberFromRow } from '@/lib/members';
import { CONTACT_STATUS_LABEL, CONTACT_STATUS_STYLE, formatJst, label } from '@/lib/format';
import { CONTACT_CATEGORIES, CONTACT_STATUSES, contactWhere, normalizeContactFilter } from '@/lib/queries/contacts';
import { ClearButton, SearchButton, SearchForm } from '@/components/SearchForm';
import { SortableTh } from '@/components/SortableTh';
import { orderBySql, resolveSort, SortColumn } from '@/lib/sort';
import { RelTime } from '@/components/RelTime';
import { ActiveFilters } from '@/components/ActiveFilters';
import { ClickableRow } from '@/components/ClickableRow';

export const metadata: Metadata = { title: 'お問い合わせ' };

/** 並べ替えできる列 */
const SORT_COLUMNS: Record<string, SortColumn> = {
  created: { sql: 'c.created_at', firstDir: 'desc' },
  number: { sql: 'c.reception_number' },
  content: { sql: 'c.category' },
  name: { sql: 'c.name' },
  member: { sql: 'COALESCE(u.display_name, u.external_id)' },
  status: { sql: "FIELD(c.status, 'pending', 'in_progress', 'completed', 'archived')" },
  assignee: { sql: 'a.display_name' },
};

type Row = Record<string, unknown> & {
  id: string;
  reception_number: string;
  category: string | null;
  service_name: string | null;
  name: string;
  email: string;
  status: string;
  created_at: string;
  assignee: string | null;
};

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const filter = normalizeContactFilter(sp);
  const page = pageFrom(sp.page);
  const perPage = perPageFrom(sp.per);
  const where = contactWhere(filter);
  const sort = resolveSort(sp, SORT_COLUMNS, { key: 'created', dir: 'desc' });
  const listParams = { ...filter, per: sp.per };
  const canEdit = hasRole(admin.role, 'support');

  const [{ rows }, { rows: count }] = await Promise.all([
    query<Row>(
      `SELECT c.id, c.reception_number, c.category, c.service_name, c.name, c.email,
              c.status, c.created_at, a.display_name AS assignee, ${MEMBER_COLUMNS}
       FROM contacts c
       LEFT JOIN admin_users a ON a.id = c.assigned_to
       LEFT JOIN users u ON u.id = c.user_id
       WHERE ${where.sql}
       ORDER BY ${orderBySql(SORT_COLUMNS, sort, 'c.id DESC')} LIMIT :limit OFFSET :offset`,
      { ...where.params, limit: perPage, offset: (page - 1) * perPage },
    ),
    query<{ total: number }>(`SELECT COUNT(*) AS total FROM contacts c WHERE ${where.sql}`, where.params),
  ]);
  const total = Number(count[0]?.total ?? 0);
  const exportQuery = new URLSearchParams(
    Object.entries(filter).filter(([, v]) => v) as [string, string][],
  ).toString();

  return (
    <div className="list-page">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="page-title mb-0">お問い合わせ</h1>
        {hasRole(admin.role, 'support') && (
          <a className="btn-sub" title="CSV ファイルをダウンロード" href={`/api/export/contacts${exportQuery ? `?${exportQuery}` : ''}`}>
            <icons.fileDownload className="h-4 w-4" />ダウンロード
          </a>
        )}
      </div>

      <SearchForm collapsible className="card mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="status">対応状況</label>
          <select className="input" id="status" name="status" defaultValue={filter.status ?? ''}>
            <option value="">すべて</option>
            {CONTACT_STATUSES.map((s) => (
              <option key={s} value={s}>{CONTACT_STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="category">お問い合わせの種類</label>
          <select className="input" id="category" name="category" defaultValue={filter.category ?? ''}>
            <option value="">すべて</option>
            {CONTACT_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="min-w-64 flex-1">
          <label className="label" htmlFor="q">受付番号・お名前・メール・電話</label>
          <input className="input" id="q" name="q" defaultValue={filter.q ?? ''} placeholder="例）2TRVPA、山田、yamada@example.com、090-1234-5678" />
        </div>
        <SearchButton />
        <ClearButton href="/contacts" />
      </SearchForm>
      <ActiveFilters basePath="/contacts" params={{ ...listParams, sort: sp.sort, dir: sp.dir }} chips={[{ key: 'status', label: '対応状況', value: filter.status ? CONTACT_STATUS_LABEL[filter.status] : '' }, { key: 'category', label: 'お問い合わせの種類', value: filter.category ?? '' }, { key: 'q', label: 'キーワード', value: filter.q ?? '' }]} />

      <BulkProvider ids={rows.map((r) => r.id)}>
        {canEdit && (
          <BulkStatusBar
            labels={CONTACT_STATUS_LABEL}
            action={setContactStatusBulkAction}
            field="対応状況"
            noun="お問い合わせ"
            defaultStatus="in_progress"
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
              <SortableTh label="受付日時" sortKey="created" sort={sort} columns={SORT_COLUMNS} basePath="/contacts" params={listParams} className={CASE_COLUMN_WIDTH.created} />
              <SortableTh label="受付番号" sortKey="number" sort={sort} columns={SORT_COLUMNS} basePath="/contacts" params={listParams} className={CASE_COLUMN_WIDTH.number} />
              <SortableTh label="対応状況" sortKey="status" sort={sort} columns={SORT_COLUMNS} basePath="/contacts" params={listParams} className={CASE_COLUMN_WIDTH.status} />
              <SortableTh label="お問い合わせの種類" sortKey="content" sort={sort} columns={SORT_COLUMNS} basePath="/contacts" params={listParams} />
              <SortableTh label="お名前" sortKey="name" sort={sort} columns={SORT_COLUMNS} basePath="/contacts" params={listParams} />
              <SortableTh label="会員" sortKey="member" sort={sort} columns={SORT_COLUMNS} basePath="/contacts" params={listParams} />
              <SortableTh label="担当" sortKey="assignee" sort={sort} columns={SORT_COLUMNS} basePath="/contacts" params={listParams} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const member = memberFromRow(r);
              return (
              <ClickableRow key={r.id} detail={{ kind: 'contact', id: r.id }}>
                {canEdit && (
                  <td className="w-10">
                    <RowCheckbox id={r.id} />
                  </td>
                )}
                <td><RelTime value={r.created_at} /></td>
                <td>
                  <a className="text-brand hover:underline" data-detail href={`/contacts/${r.id}`}>
                    {r.reception_number}
                  </a>
                </td>
                <td>
                  {canEdit ? (
                    <StatusSelect
                      key={r.status}
                      id={r.id}
                      status={r.status}
                      readOnly={false}
                      labels={CONTACT_STATUS_LABEL}
                      styles={CONTACT_STATUS_STYLE}
                      action={setContactStatusAction}
                      ariaLabel="対応状況（変えると担当者が自分になります）"
                    />
                  ) : (
                    <StatusBadge value={r.status} text={label(CONTACT_STATUS_LABEL, r.status)} />
                  )}
                </td>
                <td>{r.category}</td>
                <td>{r.name}</td>
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
                <td>{r.assignee ?? '—'}</td>
              </ClickableRow>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 8 : 7} className="py-8 text-center text-slate-500">{filter.status || filter.category || filter.q ? '検索内容に一致するデータはありません。' : 'お問い合わせはまだありません。'}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </BulkProvider>
      <Pagination basePath="/contacts" params={{ ...listParams, sort: sort.key, dir: sort.dir }} page={page} perPage={perPage} total={total} />
    </div>
  );
}
