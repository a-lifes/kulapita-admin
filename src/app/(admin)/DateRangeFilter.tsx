'use client';

import Link from 'next/link';
import { SearchButton, SearchForm } from '@/components/SearchForm';

/**
 * 期間指定 (開始日・終了日 + よく使う期間のボタン)。
 * children に他の絞り込み項目を入れられる。keep はよく使う期間のボタンで引き継ぐ条件。
 */
export function DateRangeFilter({
  from,
  to,
  presets,
  basePath = '/',
  keep = {},
  className = 'flex flex-wrap items-end gap-3',
  children,
}: {
  from: string;
  to: string;
  presets: { label: string; from: string; to: string }[];
  basePath?: string;
  keep?: Record<string, string | undefined>;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <SearchForm className={className}>
      <div>
        <label className="label" htmlFor="from">開始日</label>
        <input className="input" type="date" id="from" name="from" defaultValue={from} required />
      </div>
      <span className="pb-2 text-slate-500">〜</span>
      <div>
        <label className="label" htmlFor="to">終了日</label>
        <input className="input" type="date" id="to" name="to" defaultValue={to} required />
      </div>
      {children}
      <SearchButton label="表示" />
      <div className="flex flex-wrap gap-2 pb-0.5">
        {presets.map((p) => {
          const active = p.from === from && p.to === to;
          const qs = new URLSearchParams({
            ...(Object.fromEntries(Object.entries(keep).filter(([, v]) => v)) as Record<string, string>),
            from: p.from,
            to: p.to,
          });
          return (
            <Link
              key={p.label}
              href={`${basePath}?${qs}`}
              // 期間を切り替えても画面の位置は動かさない
              scroll={false}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                active ? 'border-brand bg-nav-active text-brand' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {p.label}
            </Link>
          );
        })}
      </div>
    </SearchForm>
  );
}
