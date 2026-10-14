'use client';

import { useRouter } from 'next/navigation';

/** 一覧に表示する件数 (選んだらその件数で 1 ページ目を開き直す) */
export function PerPageSelect({
  value,
  options,
  hrefs,
}: {
  value: number;
  options: number[];
  hrefs: Record<number, string>;
}) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2">
      <span className="text-slate-600">表示件数</span>
      <select
        className="rounded-md border border-slate-300 py-1 pr-8 pl-2.5 [background-position:right_0.5rem_center]"
        value={value}
        onChange={(e) => router.push(hrefs[Number(e.target.value)], { scroll: false })}
      >
        {options.map((n) => (
          <option key={n} value={n}>{n} 件</option>
        ))}
      </select>
    </label>
  );
}
