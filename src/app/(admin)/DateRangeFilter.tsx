'use client';

import { SearchButton, SearchForm, useSearchNavigate } from '@/components/SearchForm';

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
      {/* 「表示」ボタンと期間のボタンは上下中央でそろえる */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchButton label="表示" />
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => {
            const active = p.from === from && p.to === to;
            const qs = new URLSearchParams({
              ...(Object.fromEntries(Object.entries(keep).filter(([, v]) => v)) as Record<string, string>),
              from: p.from,
              to: p.to,
            });
            return (
              <PresetButton
                key={p.label}
                href={`${basePath}?${qs}`}
                active={active}
                label={p.label}
              />
            );
          })}
        </div>
      </div>
    </SearchForm>
  );
}

/** 期間のボタン。押すと「表示」と同じようにローディングを出して切り替える (画面の位置は動かさない) */
function PresetButton({ href, active, label }: { href: string; active: boolean; label: string }) {
  const { pending, navigate } = useSearchNavigate();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => navigate(href)}
      className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold ${
        active ? 'border-brand bg-nav-active text-brand' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
      }`}
    >
      {label}
    </button>
  );
}
