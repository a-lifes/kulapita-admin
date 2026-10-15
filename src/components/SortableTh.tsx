import Link from 'next/link';
import type { SortColumn, SortState } from '@/lib/sort';

/**
 * 並べ替えできる列の見出し。押すとその列で並べ替え、もう一度押すと逆順。
 * 並べ替え中の列には ▲ (昇順) / ▼ (降順) を出す。並べ替えたら 1 ページ目に戻る。
 */
export function SortableTh({
  label,
  sortKey,
  sort,
  columns,
  basePath,
  params,
  className,
}: {
  label: string;
  sortKey: string;
  sort: SortState;
  columns: Record<string, SortColumn>;
  basePath: string;
  /** 今の絞り込み条件・表示件数 (並べ替えても残す) */
  params: Record<string, string | undefined>;
  className?: string;
}) {
  const active = sort.key === sortKey;
  const nextDir = active ? (sort.dir === 'asc' ? 'desc' : 'asc') : (columns[sortKey]?.firstDir ?? 'asc');
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v && k !== 'page' && k !== 'sort' && k !== 'dir') q.set(k, v);
  q.set('sort', sortKey);
  q.set('dir', nextDir);
  return (
    <th className={className} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <Link
        href={`${basePath}?${q}`}
        className={`group inline-flex items-center gap-1 hover:text-slate-700 ${active ? 'text-slate-700' : ''}`}
        title="並べ替え"
      >
        {label}
        {/* 並べ替え中の列だけ矢印を出す (ほかの列はマウスを乗せたときだけ) */}
        <span className={`text-[9px] ${active ? 'text-brand' : 'text-slate-300 opacity-0 group-hover:opacity-100'}`}>
          {active ? (sort.dir === 'asc' ? '▲' : '▼') : '▲▼'}
        </span>
      </Link>
    </th>
  );
}
