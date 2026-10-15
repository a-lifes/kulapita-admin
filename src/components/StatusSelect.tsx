'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from '@/components/Toaster';

export type StatusResult = { ok: true; status: string } | { ok: false; error: string };

/** 一覧の行で状態 (プレゼントの結果・メルマガの状態など) を切り替える (選んだ時点で保存) */
export function StatusSelect({
  id,
  status,
  readOnly,
  labels,
  styles,
  action,
  ariaLabel,
}: {
  id: string;
  status: string;
  readOnly: boolean;
  labels: Record<string, string>;
  /** 状態ごとの点の色 */
  styles: Record<string, string>;
  action: (id: string, status: string) => Promise<StatusResult>;
  ariaLabel: string;
}) {
  const [value, setValue] = useState(status);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="relative inline-flex min-w-28 items-center">
      {/* 状態の色の点 (プルダウンの左端に重ねる) */}
      <span className={`pointer-events-none absolute left-3 h-[7px] w-[7px] rounded-full ${styles[value] ?? 'bg-slate-400'}`} aria-hidden="true" />
      <select
        className="w-full rounded-full border border-slate-200 bg-white py-1 pr-8 pl-7 text-sm text-slate-700 hover:border-slate-300 focus:border-brand focus:outline-none disabled:bg-white [background-position:right_0.6rem_center] [background-size:0.85rem_0.85rem]"
        value={value}
        disabled={readOnly || pending}
        aria-label={ariaLabel}
        onChange={(e) => {
          const next = e.target.value;
          const prev = value;
          setValue(next);
          startTransition(async () => {
            const res = await action(id, next);
            if (!res.ok) {
              setValue(prev);
              toast.error(res.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        {Object.entries(labels).map(([k, v]) => (
          <option key={k} value={k}>{v}</option>
        ))}
      </select>
    </div>
  );
}
