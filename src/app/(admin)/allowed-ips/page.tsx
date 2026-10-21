import type { Metadata } from 'next';
import { Pagination, pageFrom, perPageFrom } from '@/components/Pagination';
import { requireAdmin } from '@/lib/auth/guard';
import { query } from '@/lib/db';
import { cidrContains, isIpv4 } from '@/lib/cidr';
import { AddIpButton, DeleteIpButton, EditIpButton, ResyncButton } from './IpForms';
import { ClearButton, SearchButton, SearchForm } from '@/components/SearchForm';
import { SortableTh } from '@/components/SortableTh';
import { resolveSort, sortRows, SortColumn } from '@/lib/sort';
import { RelTime } from '@/components/RelTime';
import { ActiveFilters } from '@/components/ActiveFilters';

export const metadata: Metadata = { title: '許可 IP' };

/** 並べ替えできる列 */
const SORT_COLUMNS: Record<string, SortColumn> = {
  cidr: {},
  label: {},
  created: { firstDir: 'desc' },
  creator: {},
};

type Row = { id: string; cidr: string; label: string | null; created_at: string; created_by_name: string | null };

export default async function AllowedIpsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAdmin('super_admin');
  const sp = await searchParams;
  const q = sp.q?.trim().slice(0, 100) ?? '';
  const { rows: all } = await query<Row>(
    `SELECT i.id, i.cidr, i.label, i.created_at, a.display_name AS created_by_name
     FROM admin_allowed_ips i LEFT JOIN admin_users a ON a.id = i.created_by
     WHERE i.deleted_at IS NULL ORDER BY i.created_at`,
  );
  // 件数が少ないので絞り込みは取得後に行う。
  // IP アドレス (例: 152.165.122.145) を入れたときは、その IP を含む範囲も見つかるようにする
  const keyword = q.toLowerCase();
  const page = pageFrom(sp.page);
  const perPage = perPageFrom(sp.per);
  const sort = resolveSort(sp, SORT_COLUMNS, { key: 'created', dir: 'asc' });
  const listParams = { q, per: sp.per };
  const filtered = all.filter(
    (r) =>
      !keyword ||
      r.cidr.includes(keyword) ||
      (r.label ?? '').toLowerCase().includes(keyword) ||
      (isIpv4(q) && cidrContains(r.cidr, q)),
  );
  // IP アドレスは数値として並べる (10.0.0.2 が 10.0.0.10 より前に来るように)
  const ipNumber = (cidr: string) => {
    const [ip, prefix] = cidr.split('/');
    return ip.split('.').reduce((n, part) => n * 256 + Number(part), 0) * 64 + Number(prefix ?? 32);
  };
  const sorted = sortRows(filtered, sort, (r, key) => {
    switch (key) {
      case 'cidr': return ipNumber(r.cidr);
      case 'label': return r.label;
      case 'creator': return r.created_by_name;
      default: return r.created_at;
    }
  });
  const rows = sorted.slice((page - 1) * perPage, page * perPage);

  return (
    <div className="list-page">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="page-title mb-0">許可 IP</h1>
        <div className="flex items-center gap-2">
          <ResyncButton />
          <AddIpButton />
        </div>
      </div>

      <SearchForm collapsible className="card mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <label className="label" htmlFor="q">IP アドレス・メモ</label>
          <input className="input" id="q" name="q" defaultValue={q} placeholder="例）203.0.113.10、本社（IP を入れると、その IP を含む範囲も表示）" />
        </div>
        <SearchButton />
        <ClearButton href="/allowed-ips" />
      </SearchForm>
      <ActiveFilters basePath="/allowed-ips" params={{ ...listParams, sort: sp.sort, dir: sp.dir }} chips={[{ key: 'q', label: 'キーワード', value: q ?? '' }]} />

      <div className="card table-scroll">
        <table className="table">
          <thead>
            <tr>
              <SortableTh label="IP アドレス（CIDR）" sortKey="cidr" sort={sort} columns={SORT_COLUMNS} basePath="/allowed-ips" params={listParams} />
              <SortableTh label="メモ" sortKey="label" sort={sort} columns={SORT_COLUMNS} basePath="/allowed-ips" params={listParams} />
              <SortableTh label="登録日時" sortKey="created" sort={sort} columns={SORT_COLUMNS} basePath="/allowed-ips" params={listParams} />
              <SortableTh label="登録者" sortKey="creator" sort={sort} columns={SORT_COLUMNS} basePath="/allowed-ips" params={listParams} />
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.cidr}</td>
                <td>{r.label ?? '—'}</td>
                <td><RelTime value={r.created_at} /></td>
                <td>{r.created_by_name ?? '（初期設定）'}</td>
                <td className="w-28 text-right whitespace-nowrap">
                  <EditIpButton id={r.id} cidr={r.cidr} label={r.label} />
                  <DeleteIpButton id={r.id} cidr={r.cidr} label={r.label} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="py-8 text-center text-slate-500">{q ? '検索内容に一致するデータはありません。' : '許可 IP は登録されていません。'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination basePath="/allowed-ips" params={{ ...listParams, sort: sort.key, dir: sort.dir }} page={page} perPage={perPage} total={filtered.length} />
    </div>
  );
}
