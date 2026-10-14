'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from '@/components/Toaster';
import { PRESENT_STATUS_LABEL } from '@/lib/format';
import { setPresentStatusAction } from './actions';

const STYLES: Record<string, string> = {
  applied: 'border-sky-300 bg-sky-50 text-sky-800',
  won: 'border-emerald-400 bg-emerald-50 text-emerald-800',
  lost: 'border-slate-300 bg-slate-100 text-slate-700',
};

/** 一覧の行で 応募 / 当選 / 落選 を切り替える (選んだ時点で保存) */
export function PresentStatusSelect({ id, status, readOnly }: { id: string; status: string; readOnly: boolean }) {
  const [value, setValue] = useState(status);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="min-w-28">
      <select
        className={`rounded-md border py-1 pr-8 pl-2.5 text-sm font-semibold [background-position:right_0.5rem_center] ${STYLES[value] ?? ''}`}
        value={value}
        disabled={readOnly || pending}
        aria-label="抽選結果"
        onChange={(e) => {
          const next = e.target.value;
          const prev = value;
          setValue(next);
          startTransition(async () => {
            const res = await setPresentStatusAction(id, next);
            if (!res.ok) {
              setValue(prev);
              toast.error(res.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        {Object.entries(PRESENT_STATUS_LABEL).map(([k, v]) => (
          <option key={k} value={k}>{v}</option>
        ))}
      </select>
    </div>
  );
}
