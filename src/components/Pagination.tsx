import Link from 'next/link';
import { PerPageSelect } from './PerPageSelect';

/** 一覧に表示する件数の選択肢と初期値 */
export const PER_PAGE_OPTIONS = [20, 50, 100] as const;
export const DEFAULT_PER_PAGE = 50;

export function pageFrom(value: string | undefined): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
}

export function perPageFrom(value: string | undefined): number {
  const n = Number(value);
  return (PER_PAGE_OPTIONS as readonly number[]).includes(n) ? n : DEFAULT_PER_PAGE;
}

/** 現在の検索条件を保ったまま前後のページへ移動する。右に表示件数のプルダウン */
export function Pagination({
  basePath,
  params,
  page,
  perPage,
  total,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  perPage: number;
  total: number;
}) {
  const last = Math.max(1, Math.ceil(total / perPage));
  const query = (p: number, per = perPage) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    if (per !== DEFAULT_PER_PAGE) q.set('per', String(per));
    if (p > 1) q.set('page', String(p));
    return q.toString();
  };
  const href = (p: number) => {
    const s = query(p);
    return s ? `${basePath}?${s}` : basePath;
  };
  return (
    <div className="mt-4 flex shrink-0 flex-wrap items-center gap-3 text-sm">
      <span>
        全 {total.toLocaleString()} 件（{Math.min(page, last)} / {last} ページ）
      </span>
      {page > 1 && <Link className="btn-sub" href={href(page - 1)}>前へ</Link>}
      {page < last && <Link className="btn-sub" href={href(page + 1)}>次へ</Link>}
      <PerPageSelect
        value={perPage}
        options={[...PER_PAGE_OPTIONS]}
        // 件数を変えたら 1 ページ目に戻す
        hrefs={Object.fromEntries(PER_PAGE_OPTIONS.map((n) => [n, `${basePath}?${query(1, n)}`]))}
      />
    </div>
  );
}
