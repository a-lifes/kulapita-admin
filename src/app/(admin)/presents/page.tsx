import type { Metadata } from 'next';
import { MemberButton } from '@/components/MemberButton';
import { Pagination, pageFrom, perPageFrom } from '@/components/Pagination';
import { hasRole } from '@/lib/adminUsers';
import { requireAdmin } from '@/lib/auth/guard';
import { query } from '@/lib/db';
import { formatJst } from '@/lib/format';
import { MEMBER_COLUMNS, memberFromRow } from '@/lib/members';
import { getCampaignItems } from '@/lib/microcms';
import { normalizePresentFilter, presentWhere } from '@/lib/queries/lists';
import { PresentFilters } from './PresentFilters';
import { PresentStatusSelect } from './PresentStatusSelect';
import { SortableTh } from '@/components/SortableTh';
import { orderBySql, resolveSort, SortColumn } from '@/lib/sort';

export const metadata: Metadata = { title: 'プレゼント' };

/** 並べ替えできる列 */
const SORT_COLUMNS: Record<string, SortColumn> = {
  created: { sql: 'p.created_at', firstDir: 'desc' },
  campaign: { sql: 'p.campaign_key', firstDir: 'desc' },
  item: { sql: 'p.item_index' },
  member: { sql: 'u.external_id' },
  name: { sql: 'u.display_name' },
  email: { sql: 'p.email' },
  status: { sql: "FIELD(p.status, 'applied', 'won', 'lost')" },
};

type Row = Record<string, unknown> & {
  id: string;
  campaign_key: string;
  item_index: number;
  item_name: string;
  email: string | null;
  status: string;
  created_at: string;
};

type SummaryRow = { campaign_key: string; item_index: number; item_name: string; total: number; won: number };

export default async function PresentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const filter = normalizePresentFilter(sp);
  const page = pageFrom(sp.page);
  const perPage = perPageFrom(sp.per);
  const where = presentWhere(filter);
  const sort = resolveSort(sp, SORT_COLUMNS, { key: 'created', dir: 'desc' });
  const listParams = { ...filter, per: sp.per };

  const [{ rows }, { rows: count }, { rows: summary }] = await Promise.all([
    query<Row>(
      `SELECT p.id, p.campaign_key, p.item_index, p.item_name, p.email, p.status, p.created_at, ${MEMBER_COLUMNS}
       FROM present_applications p LEFT JOIN users u ON u.id = p.user_id
       WHERE ${where.sql}
       ORDER BY ${orderBySql(SORT_COLUMNS, sort, 'p.id DESC')} LIMIT :limit OFFSET :offset`,
      { ...where.params, limit: perPage, offset: (page - 1) * perPage },
    ),
    query<{ total: number }>(`SELECT COUNT(*) AS total FROM present_applications p WHERE ${where.sql}`, where.params),
    query<SummaryRow>(
      `SELECT campaign_key, item_index, MAX(item_name) AS item_name, COUNT(*) AS total, SUM(status = 'won') AS won
       FROM present_applications GROUP BY campaign_key, item_index
       ORDER BY campaign_key DESC, item_index LIMIT 500`,
    ),
  ]);
  const total = Number(count[0]?.total ?? 0);
  const campaigns = [...new Set(summary.map((s) => s.campaign_key))];
  const itemsByCampaign: Record<string, { index: number; name: string }[]> = {};
  for (const s of summary) {
    (itemsByCampaign[s.campaign_key] ??= []).push({ index: Number(s.item_index), name: s.item_name });
  }

  // 景品ごとの応募数・当選数・当選者数 (当選者数は microCMS から)
  const shownCampaign = filter.campaign ?? campaigns[0];
  const shownSummary = summary.filter((s) => s.campaign_key === shownCampaign);
  const cms = shownCampaign ? await getCampaignItems(shownCampaign) : { items: null };

  const exportQuery = new URLSearchParams(Object.entries(filter).filter(([, v]) => v) as [string, string][]).toString();
  const canEdit = hasRole(admin.role, 'support');

  return (
    <div className="list-page">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="page-title mb-0">プレゼント</h1>
        {hasRole(admin.role, 'admin') && (
          <a className="btn-sub" href={`/api/export/presents${exportQuery ? `?${exportQuery}` : ''}`}>CSV ダウンロード</a>
        )}
      </div>

      {shownSummary.length > 0 && (
        <div className="card mb-4">
          <h2 className="mb-3 text-sm font-bold">景品ごとの状況（{shownCampaign}）</h2>
          <ul className="flex flex-wrap gap-3 text-sm">
            {shownSummary.map((s) => {
              const winners = cms.items?.[Number(s.item_index)]?.winners ?? null;
              const won = Number(s.won ?? 0);
              const full = winners !== null && won >= winners;
              return (
                <li key={s.item_index} className={`rounded border px-3 py-2 ${full ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200'}`}>
                  <p className="font-semibold">{Number(s.item_index) + 1}. {s.item_name}</p>
                  <p className="mt-1">
                    応募 <strong>{Number(s.total).toLocaleString()}</strong> 件 ／ 当選{' '}
                    <strong>{won}</strong>
                    {winners !== null ? ` / ${winners} 名` : ' 名（当選者数 不明）'}
                  </p>
                </li>
              );
            })}
          </ul>
          {cms.error && <p className="mt-3 text-xs text-red-700">当選者数: {cms.error}</p>}
        </div>
      )}

      <PresentFilters campaigns={campaigns} itemsByCampaign={itemsByCampaign} initial={filter} />

      <div className="card table-scroll">
        <table className="table">
          <thead>
            <tr>
              <SortableTh label="応募日時" sortKey="created" sort={sort} columns={SORT_COLUMNS} basePath="/presents" params={listParams} />
              <SortableTh label="キャンペーン" sortKey="campaign" sort={sort} columns={SORT_COLUMNS} basePath="/presents" params={listParams} />
              <SortableTh label="景品" sortKey="item" sort={sort} columns={SORT_COLUMNS} basePath="/presents" params={listParams} />
              <SortableTh label="会員番号" sortKey="member" sort={sort} columns={SORT_COLUMNS} basePath="/presents" params={listParams} />
              <SortableTh label="お名前" sortKey="name" sort={sort} columns={SORT_COLUMNS} basePath="/presents" params={listParams} />
              <SortableTh label="メール" sortKey="email" sort={sort} columns={SORT_COLUMNS} basePath="/presents" params={listParams} />
              <SortableTh label="結果" sortKey="status" sort={sort} columns={SORT_COLUMNS} basePath="/presents" params={listParams} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const member = memberFromRow(r);
              return (
                <tr key={r.id}>
                  <td>{formatJst(r.created_at)}</td>
                  <td>{r.campaign_key}</td>
                  <td>{Number(r.item_index) + 1}. {r.item_name}</td>
                  <td>
                    {member ? (
                      <MemberButton
                        member={member}
                        formatted={{
                          first_authenticated_at: formatJst(member.first_authenticated_at),
                          last_login_at: formatJst(member.last_login_at),
                          profile_updated_at: formatJst(member.profile_updated_at),
                        }}
                      />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{member?.display_name ?? '—'}</td>
                  <td>{r.email ?? '—'}</td>
                  <td><PresentStatusSelect id={r.id} status={r.status} readOnly={!canEdit} /></td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-slate-500">{filter.campaign || filter.item || filter.status ? '検索内容に一致するデータはありません。' : 'プレゼントの応募はまだありません。'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination basePath="/presents" params={{ ...listParams, sort: sort.key, dir: sort.dir }} page={page} perPage={perPage} total={total} />
    </div>
  );
}
