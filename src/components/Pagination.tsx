import Link from 'next/link';

export const PAGE_SIZE = 50;

export function pageFrom(value: string | undefined): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
}

/** 現在の検索条件を保ったまま前後のページへ移動する */
export function Pagination({
  basePath,
  params,
  page,
  total,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  total: number;
}) {
  const last = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    if (p > 1) q.set('page', String(p));
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  return (
    <div className="mt-4 flex items-center gap-3 text-sm">
      <span>
        全 {total.toLocaleString()} 件（{page} / {last} ページ）
      </span>
      {page > 1 && <Link className="btn-sub" href={href(page - 1)}>前へ</Link>}
      {page < last && <Link className="btn-sub" href={href(page + 1)}>次へ</Link>}
    </div>
  );
}
