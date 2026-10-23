'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from '@/components/Toaster';

export type StatusResult = { ok: true; status: string } | { ok: false; error: string };

/**
 * 点の色ごとの、プルダウン全体の薄い色 (背景・枠)。状態がひと目でわかるようにする。
 * (Tailwind はクラス名をそのまま書いておく必要があるので、対応表にしている)
 */
const TINT: Record<string, string> = {
  'bg-slate-400': 'bg-slate-100 border-slate-300 hover:border-slate-400',
  'bg-emerald-500': 'bg-emerald-50 border-emerald-200 hover:border-emerald-300',
  'bg-amber-500': 'bg-amber-50 border-amber-200 hover:border-amber-300',
  'bg-rose-500': 'bg-rose-50 border-rose-200 hover:border-rose-300',
  'bg-sky-500': 'bg-sky-50 border-sky-200 hover:border-sky-300',
  'bg-indigo-500': 'bg-indigo-50 border-indigo-200 hover:border-indigo-300',
};

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
  const dot = styles[value] ?? 'bg-slate-400';

  return (
    <div className="relative inline-flex min-w-[8.5rem] items-center">
      {/* 状態の色の点 (プルダウンの左端に重ねる) */}
      <span className={`pointer-events-none absolute left-3 h-[7px] w-[7px] rounded-full ${dot}`} aria-hidden="true" />
      <select
        className={`w-full rounded-full border py-1 pr-8 pl-7 text-sm text-slate-700 focus:border-brand focus:outline-none ${TINT[dot] ?? 'border-slate-200 bg-white hover:border-slate-300'} [background-position:right_0.6rem_center] [background-size:0.85rem_0.85rem]`}
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
          <option key={k} value={k} className="bg-white">{v}</option>
        ))}
      </select>
    </div>
  );
}
