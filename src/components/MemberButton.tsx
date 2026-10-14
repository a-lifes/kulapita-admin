'use client';

import { useEffect, useRef, useState } from 'react';
import { type Member } from '@/lib/members';

/**
 * 会員番号 (または label に渡した名前など) を押すと、会員情報をモーダルで表示する。
 * 会員一覧・申し込み・誘導・プレゼントで共通。
 */
export function MemberButton({
  member,
  formatted,
  label,
}: {
  member: Member;
  formatted: Record<string, string>;
  /** ボタンに出す文字 (省略時は会員番号) */
  label?: string;
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
        className="text-left text-brand underline"
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
        className="m-auto w-[min(560px,92vw)] rounded-lg p-0 text-left font-normal whitespace-normal break-words backdrop:bg-black/40"
      >
        <div className="p-6">
          <h2 className="mb-4 text-lg font-bold">会員情報</h2>
          <dl className="grid grid-cols-[9rem_1fr] gap-x-4 gap-y-2 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="font-semibold text-slate-600">{k}</dt>
                <dd className="min-w-0 break-all whitespace-normal select-all">{v || '—'}</dd>
              </div>
            ))}
          </dl>
          {!member.profile_updated_at && (
            <p className="mt-4 text-xs text-slate-500">
              ※ 住所・電話番号は、組合HP から届いたとき (ログイン・プレゼント応募) に保存されます。まだ届いていません。
            </p>
          )}
          <div className="mt-6 text-right">
            <button type="button" className="btn-sub" onClick={() => setOpen(false)}>閉じる</button>
          </div>
        </div>
      </dialog>
    </>
  );
}
