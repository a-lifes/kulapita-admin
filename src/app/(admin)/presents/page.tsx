import type { Metadata } from 'next';
import Link from 'next/link';
import { MemberButton } from '@/components/MemberButton';
import { Pagination, pageFrom, perPageFrom } from '@/components/Pagination';
import { hasRole } from '@/lib/adminUsers';
import { requireAdmin } from '@/lib/auth/guard';
import { query } from '@/lib/db';
import { formatJst } from '@/lib/format';
import { MEMBER_COLUMNS, memberFromRow } from '@/lib/members';
import { getAllCampaigns } from '@/lib/microcms';
import { normalizePresentFilter, presentWhere } from '@/lib/queries/lists';
import { PresentFilters } from './PresentFilters';
import { PresentStatusSelect } from './PresentStatusSelect';
import { ItemImage } from './ItemImage';
import { PresentBulkBar, PresentBulkProvider, RowCheckbox, SelectAllCheckbox } from './PresentBulk';
import { SortableTh } from '@/components/SortableTh';
import { orderBySql, resolveSort, SortColumn } from '@/lib/sort';

export const metadata: Metadata = { title: 'プレゼント' };

/** 並べ替えできる列 */
const SORT_COLUMNS: Record<string, SortColumn> = {
  created: { sql: 'p.created_at', firstDir: 'desc' },
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
  const page = pageFrom(sp.page);
  const perPage = perPageFrom(sp.per);
  const sort = resolveSort(sp, SORT_COLUMNS, { key: 'created', dir: 'desc' });

  // 開催月ごとの応募の件数 (DB) と、キャンペーン・景品の一覧 (microCMS)。
  // 開催月・景品は microCMS を正とし、応募が 0 件の景品も出す。microCMS に無いもの (削除済みなど) は DB から補う。
  const [{ rows: summary }, cmsAll] = await Promise.all([
    query<SummaryRow>(
      `SELECT campaign_key, item_index, MAX(item_name) AS item_name, COUNT(*) AS total, SUM(status = 'won') AS won
       FROM present_applications GROUP BY campaign_key, item_index
       ORDER BY campaign_key DESC, item_index LIMIT 500`,
    ),
    getAllCampaigns(),
  ]);
  const itemsByCampaign: Record<string, { index: number; name: string }[]> = {};
  for (const [key, items] of cmsAll.campaigns ?? []) {
    itemsByCampaign[key] = items.map((item, index) => ({ index, name: item.name }));
  }
  for (const s of summary) {
    const list = (itemsByCampaign[s.campaign_key] ??= []);
    if (!list.some((i) => i.index === Number(s.item_index))) {
      list.push({ index: Number(s.item_index), name: s.item_name });
      list.sort((a, b) => a.index - b.index);
    }
  }
  const campaigns = Object.keys(itemsByCampaign).sort().reverse();

  // 開催月は必ず 1 つに絞る (指定が無い・存在しないときは一番新しい月)
  const campaign = sp.campaign && campaigns.includes(sp.campaign) ? sp.campaign : campaigns[0];
  const filter = normalizePresentFilter({ ...sp, campaign });
  const where = presentWhere(filter);
  const listParams = { ...filter, per: sp.per };

  const [{ rows }, { rows: count }] = campaign
    ? await Promise.all([
        query<Row>(
          `SELECT p.id, p.campaign_key, p.item_index, p.item_name, p.email, p.status, p.created_at, ${MEMBER_COLUMNS}
           FROM present_applications p LEFT JOIN users u ON u.id = p.user_id
           WHERE ${where.sql}
           ORDER BY ${orderBySql(SORT_COLUMNS, sort, 'p.id DESC')} LIMIT :limit OFFSET :offset`,
          { ...where.params, limit: perPage, offset: (page - 1) * perPage },
        ),
        query<{ total: number }>(`SELECT COUNT(*) AS total FROM present_applications p LEFT JOIN users u ON u.id = p.user_id WHERE ${where.sql}`, where.params),
      ])
    : [{ rows: [] as Row[] }, { rows: [] as { total: number }[] }];
  const total = Number(count[0]?.total ?? 0);

  // 景品ごとの応募数・当選数・当選者数 (景品名・当選者数は microCMS、件数は DB)
  const cmsItems = campaign ? (cmsAll.campaigns?.get(campaign) ?? null) : null;
  const cms = {
    items: cmsItems,
    error: cmsAll.error ?? (campaign && !cmsItems ? 'microCMS にこのキャンペーンが見つかりません' : undefined),
  };
  const shownSummary = (campaign ? (itemsByCampaign[campaign] ?? []) : []).map((item) => {
    const counted = summary.find((s) => s.campaign_key === campaign && Number(s.item_index) === item.index);
    return { item_index: item.index, item_name: item.name, total: Number(counted?.total ?? 0), won: Number(counted?.won ?? 0) };
  });

  const exportQuery = new URLSearchParams(Object.entries(filter).filter(([, v]) => v) as [string, string][]).toString();
  const canEdit = hasRole(admin.role, 'support');
  const colCount = canEdit ? 7 : 6;

  return (
    <div className="list-page">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="page-title mb-0">プレゼント</h1>
        {hasRole(admin.role, 'admin') && campaign && (
          <a className="btn-sub" href={`/api/export/presents?${exportQuery}`}>CSV ダウンロード</a>
        )}
      </div>

      {campaign && <PresentFilters key={`${campaign}-${filter.item ?? ''}-${filter.status ?? ''}`} campaigns={campaigns} itemsByCampaign={itemsByCampaign} initial={{ ...filter, campaign }} />}

      {shownSummary.length > 0 && (
        <div className="card mb-4">
          <h2 className="mb-3 text-sm font-bold">景品ごとの状況（{campaign}）</h2>
          <ul className="flex flex-wrap gap-3 text-sm">
            {shownSummary.map((s) => {
              const winners = cms.items?.[Number(s.item_index)]?.winners ?? null;
              const imageUrl = cms.items?.[Number(s.item_index)]?.imageUrl ?? null;
              const selected = filter.item === String(s.item_index) && filter.status === 'won';
              const won = Number(s.won ?? 0);
              const full = winners !== null && won >= winners;
              return (
                <li
                  key={s.item_index}
                  className={`flex items-center gap-3 rounded border px-3 py-2 hover:border-brand ${
                    selected
                      ? 'border-brand bg-nav-active ring-1 ring-brand'
                      : full
                        ? 'border-emerald-400 bg-emerald-50'
                        : 'border-slate-200'
                  }`}
                >
                  {/* microCMS の景品の画像。押すと拡大 */}
                  {imageUrl ? (
                    <ItemImage url={imageUrl} name={s.item_name} />
                  ) : (
                    <span className="h-12 w-12 shrink-0 rounded bg-slate-100" aria-hidden="true" />
                  )}
                  {/* 文字の部分を押すと、この景品の当選者だけに絞り込む (もう一度押すと解除) */}
                  <Link
                    href={
                      selected
                        ? `/presents?campaign=${encodeURIComponent(campaign!)}`
                        : `/presents?campaign=${encodeURIComponent(campaign!)}&item=${s.item_index}&status=won`
                    }
                    scroll={false}
                    aria-pressed={selected}
                    title={selected ? '絞り込みを解除する' : 'この景品の当選者を表示する'}
                    className="block self-stretch py-0.5"
                  >
                    <p>{s.item_name}</p>
                    <p className="mt-0.5 text-slate-600">
                      応募 {Number(s.total).toLocaleString()} 件（当選 {won}
                      {winners !== null ? ` / ${winners} 名` : ' 名・当選者数 不明'}）
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
          {cms.error && <p className="mt-3 text-xs text-red-700">当選者数: {cms.error}</p>}
        </div>
      )}

      <PresentBulkProvider ids={rows.map((r) => r.id)}>
        {canEdit && <PresentBulkBar />}
        <div className="card table-scroll">
          <table className="table">
            <thead>
              <tr>
                {canEdit && (
                  <th className="w-10">
                    <SelectAllCheckbox />
                  </th>
                )}
                <SortableTh label="結果" sortKey="status" sort={sort} columns={SORT_COLUMNS} basePath="/presents" params={listParams} />
                <SortableTh label="応募日時" sortKey="created" sort={sort} columns={SORT_COLUMNS} basePath="/presents" params={listParams} />
                <SortableTh label="景品" sortKey="item" sort={sort} columns={SORT_COLUMNS} basePath="/presents" params={listParams} />
                <SortableTh label="会員番号" sortKey="member" sort={sort} columns={SORT_COLUMNS} basePath="/presents" params={listParams} />
                <SortableTh label="お名前" sortKey="name" sort={sort} columns={SORT_COLUMNS} basePath="/presents" params={listParams} />
                <SortableTh label="メール" sortKey="email" sort={sort} columns={SORT_COLUMNS} basePath="/presents" params={listParams} />
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
                    <td><PresentStatusSelect key={r.status} id={r.id} status={r.status} readOnly={!canEdit} /></td>
                    <td>{formatJst(r.created_at)}</td>
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
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={colCount} className="py-8 text-center text-slate-500">{filter.item || filter.status || filter.q ? '検索内容に一致するデータはありません。' : 'プレゼントの応募はまだありません。'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </PresentBulkProvider>
      <Pagination basePath="/presents" params={{ ...listParams, sort: sort.key, dir: sort.dir }} page={page} perPage={perPage} total={total} />
    </div>
  );
}
