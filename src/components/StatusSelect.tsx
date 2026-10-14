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
  /** 状態ごとの色 */
  styles: Record<string, string>;
  action: (id: string, status: string) => Promise<StatusResult>;
  ariaLabel: string;
}) {
  const [value, setValue] = useState(status);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="min-w-28">
      <select
        className={`rounded-md border py-1 pr-8 pl-2.5 text-sm font-semibold [background-position:right_0.5rem_center] ${styles[value] ?? ''}`}
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
