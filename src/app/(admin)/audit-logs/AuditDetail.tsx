'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

export type AuditDetailData = {
  createdAt: string;
  accountName: string | null;
  email: string | null;
  action: string;
  target: string;
  targetHref: string | null;
  diff: string | null;
  ip: string | null;
  userAgent: string | null;
};

/** 内容 (JSON) を読みやすく整形する。JSON でなければそのまま */
function pretty(diff: string | null): string {
  if (!diff) return '—';
  try {
    return JSON.stringify(JSON.parse(diff), null, 2);
  } catch {
    return diff;
  }
}

/** 日時のリンク → 画面中央のダイアログで、その操作の全項目を表示する */
export function AuditDetailLink({ data }: { data: AuditDetailData }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const rows: [string, React.ReactNode][] = [
    ['日時', data.createdAt],
    ['操作アカウント', data.accountName ?? '—'],
    ['メールアドレス', data.email ?? '—'],
    ['操作', data.action],
    [
      '対象',
      data.targetHref ? (
        <Link className="text-brand hover:underline" href={data.targetHref}>{data.target}</Link>
      ) : (
        data.target
      ),
    ],
    ['IP', data.ip ?? '—'],
    ['ブラウザ', data.userAgent ?? '—'],
  ];

  return (
    <>
      <button type="button" className="text-brand hover:underline" onClick={() => setOpen(true)}>
        {data.createdAt}
      </button>
      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === ref.current) setOpen(false);
        }}
        className="m-auto w-[min(640px,92vw)] rounded-xl p-0 text-left font-normal whitespace-normal break-words shadow-2xl backdrop:bg-slate-900/50"
      >
        {open && (
          <div className="p-6">
            <h2 className="mb-4 text-base font-bold text-slate-900">操作ログの詳細</h2>
            <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2 text-sm">
              {rows.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="font-semibold text-slate-600">{k}</dt>
                  <dd className="min-w-0 break-all text-slate-800">{v}</dd>
                </div>
              ))}
              <dt className="font-semibold text-slate-600">内容</dt>
              <dd className="min-w-0">
                <pre className="max-h-72 overflow-auto rounded-md bg-slate-50 p-3 text-xs leading-relaxed whitespace-pre-wrap text-slate-800">
                  {pretty(data.diff)}
                </pre>
              </dd>
            </dl>
            <div className="mt-6 text-right">
              <button type="button" className="btn-sub" onClick={() => setOpen(false)}>閉じる</button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
