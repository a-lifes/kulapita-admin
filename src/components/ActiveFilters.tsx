import Link from 'next/link';

/**
 * 今かかっている絞り込み条件を「状態：未対応 ×」のような札で一覧の上に出す。
 * × を押すとその条件だけを外す。条件が無いときは何も出さない。
 */
export type FilterChip = { key: string; label: string; value: string };

export function ActiveFilters({
  basePath,
  params,
  chips,
}: {
  basePath: string;
  /** 今の URL の条件 (並べ替え・表示件数を含む)。札を外すときもほかの条件は残す */
  params: Record<string, string | undefined>;
  chips: FilterChip[];
}) {
  const shown = chips.filter((c) => c.value);
  if (shown.length === 0) return null;
  const hrefWithout = (keys: string[]) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== 'page' && !keys.includes(k)) q.set(k, v);
    const qs = q.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  return (
    <div className="-mt-1 mb-3 flex flex-wrap items-center gap-2">
      {shown.map((c) => (
        <span
          key={c.key}
          className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white py-0.5 pr-1 pl-3 text-xs text-slate-600"
        >
          <span className="text-slate-400">{c.label}：</span>
          <span className="max-w-60 truncate font-medium text-slate-700">{c.value}</span>
          <Link
            href={hrefWithout([c.key])}
            scroll={false}
            className="ml-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label={`${c.label}の条件を外す`}
            title="この条件を外す"
          >
            ×
          </Link>
        </span>
      ))}
      {shown.length > 1 && (
        <Link
          href={hrefWithout(shown.map((c) => c.key))}
          scroll={false}
          className="text-xs text-slate-500 hover:text-brand hover:underline"
        >
          すべて外す
        </Link>
      )}
    </div>
  );
}
