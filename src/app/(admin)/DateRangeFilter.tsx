'use client';

import Link from 'next/link';

/** ダッシュボードの期間指定 (開始日・終了日 + よく使う期間のボタン) */
export function DateRangeFilter({
  from,
  to,
  presets,
}: {
  from: string;
  to: string;
  presets: { label: string; from: string; to: string }[];
}) {
  return (
    <form className="flex flex-wrap items-end gap-3">
      <div>
        <label className="label" htmlFor="from">開始日</label>
        <input className="input" type="date" id="from" name="from" defaultValue={from} required />
      </div>
      <span className="pb-2 text-slate-500">〜</span>
      <div>
        <label className="label" htmlFor="to">終了日</label>
        <input className="input" type="date" id="to" name="to" defaultValue={to} required />
      </div>
      <button className="btn">表示</button>
      <div className="flex flex-wrap gap-2 pb-0.5">
        {presets.map((p) => {
          const active = p.from === from && p.to === to;
          return (
            <Link
              key={p.label}
              href={`/?from=${p.from}&to=${p.to}`}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                active ? 'border-brand bg-nav-active text-brand' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {p.label}
            </Link>
          );
        })}
      </div>
    </form>
  );
}
