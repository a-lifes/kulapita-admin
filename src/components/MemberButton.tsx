'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { type Member } from '@/lib/members';

/**
 * 会員番号 (または label に渡した名前など) を押すと、会員情報をモーダルで表示する。
 * 会員一覧・申し込み・誘導・プレゼントで共通。
 */
/** 会員情報に足して出す件数 (押すとその一覧へ移る)。例: プレゼントの応募数・当選数 */
export type MemberLinkStat = { label: string; value: number; href: string; title?: string };

export function MemberButton({
  member,
  formatted,
  label,
  stats,
}: {
  member: Member;
  formatted: Record<string, string>;
  /** ボタンに出す文字 (省略時は会員番号) */
  label?: string;
  stats?: MemberLinkStat[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const rows: [string, string][] = [
    ['会員番号', member.external_id],
    ['お名前', member.display_name ?? ''],
    ['メールアドレス', member.email ?? ''],
    ['電話番号', member.phone ?? ''],
    ['郵便番号', member.zipcode ?? ''],
    ['都道府県', member.prefecture ?? ''],
    ['市区町村・番地', member.city ?? ''],
    ['建物名・部屋番号', member.building ?? ''],
    ['初回ログイン', formatted.first_authenticated_at ?? ''],
    ['最終ログイン', formatted.last_login_at ?? ''],
    ['会員情報の更新日時', formatted.profile_updated_at ?? ''],
  ];

  return (
    <>
      <button
        type="button"
        className="text-left text-brand hover:underline"
        onClick={() => setOpen(true)}
      >
        {label || member.external_id}
      </button>
      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          // 枠の外 (背景) を押したら閉じる
          if (e.target === ref.current) setOpen(false);
        }}
        className="drawer-panel fixed inset-y-0 right-0 left-auto m-0 h-full max-h-none w-[min(480px,92vw)] bg-canvas p-0 text-left font-normal whitespace-normal break-words shadow-2xl backdrop:bg-slate-900/25"
      >
        <div className="p-6">
          <h2 className="mb-4 text-lg font-bold">会員情報</h2>
          <dl className="card grid grid-cols-[9rem_1fr] gap-x-4 gap-y-2 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="font-semibold text-slate-600">{k}</dt>
                <dd className="min-w-0 break-all whitespace-normal select-all">{v || '—'}</dd>
              </div>
            ))}
          </dl>
          {stats && stats.length > 0 && (
            <dl className="card mt-3 grid grid-cols-[9rem_1fr] gap-x-4 gap-y-2 text-sm">
              {stats.map((s) => (
                <div key={s.label} className="contents">
                  <dt className="font-semibold text-slate-600">{s.label}</dt>
                  <dd>
                    {/* 押すと一覧へ移る (モーダルは閉じる) */}
                    <Link
                      href={s.href}
                      title={s.title}
                      className="font-semibold text-brand hover:underline"
                      onClick={() => setOpen(false)}
                    >
                      {s.value.toLocaleString()} 件
                    </Link>
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <p className="mt-4 text-xs text-slate-500">※会員情報はログイン時に毎回最新情報に更新しています。</p>
          <div className="mt-6 text-right">
            <button type="button" className="btn-sub" onClick={() => setOpen(false)}>閉じる</button>
          </div>
        </div>
      </dialog>
    </>
  );
}
