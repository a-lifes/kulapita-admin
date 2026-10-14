/**
 * ダッシュボードのカードの「昨日比・前月比」。増減の割合を丸い帯で出す。
 * 比べる相手の 100% 以上 (同じか増えた) は青、100% 未満 (減った) は赤。
 * 相手が 0 件のときは割合を出せないので、相手の件数だけを灰色で出す。
 */
export function CompareBadge({
  value,
  base,
  label,
  note,
}: {
  value: number;
  base: number | null;
  label: string;
  /** 何と比べているか (マウスを乗せると出る) */
  note: string;
}) {
  if (base === null) return null;
  if (base === 0) {
    return (
      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-500" title={`${label}：${note}は 0`}>
        {label} —
      </span>
    );
  }
  const change = ((value - base) / base) * 100;
  const up = value >= base;
  const text = `${change > 0 ? '+' : ''}${Number.isInteger(change) ? change : change.toFixed(1)}%`;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs tabular-nums ${
        up ? 'bg-sky-50 text-sky-700' : 'bg-rose-50 text-rose-600'
      }`}
      title={`${label}：${note}は ${base.toLocaleString()}`}
    >
      <span className="opacity-75">{label}</span>
      {text}
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
        {up ? (
          <path d="M1.5 12 6 7.5l3 3L14.5 5M10.5 5h4v4" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M1.5 4 6 8.5l3-3L14.5 11M10.5 11h4V7" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
    </span>
  );
}
