'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useConfirm } from '@/components/ConfirmDialog';
import { icons, spacedLabel } from '@/components/icons';
import { toast } from '@/components/Toaster';
import {
  applyAutoDrawAction,
  type DrawConditions,
  type DrawItemPlan,
  previewAutoDrawAction,
  resetDrawAction,
} from './autoDraw';

const CONDITIONS: { key: keyof DrawConditions; label: string; note: string }[] = [
  { key: 'frequent', label: '応募回数が多い人の当選確率を上げる', note: 'これまでのプレゼントへの応募が多いほど当選する確率が上がります。' },
  { key: 'applications', label: 'コンバージョン（申し込み）が多い人の当選確率を上げる', note: 'サービスへの申し込みが多いほど当選する確率が上がります（10 件まで）。' },
  { key: 'clicks', label: 'コンバージョン（誘導）が多い人の当選確率を上げる', note: '外部サービスへの誘導（サービスサイトを見る）が多いほど当選する確率が上がります（10 回まで）。' },
  { key: 'excludePast', label: '過去に当選実績のある会員は除く', note: '過去にプレゼントに当選した実績がある会員は抽選対象外になります。' },
  { key: 'sameGroup', label: '過去と同じ枠の当選はしない', note: '過去に当選した枠（groups）と同じ枠の景品は抽選対象外になります。例）過去に枠 1 で当選した会員は、枠 2・3 の景品だけが当選の対象になります。' },
];

/**
 * プレゼント一覧の「抽選」。条件を選んで抽選 → 結果を確認 → 反映 (当選・残りは落選)。
 * disabledReason があるとき (応募数が当選者数に満たない景品があるなど) は押せない。
 */
export function AutoDrawButton({
  campaign,
  campaignLabel,
  disabledReason,
  decidedCount,
}: {
  campaign: string;
  campaignLabel: string;
  /** 使えない理由。あるときはボタンを押すと理由を出す (抽選は始めない) */
  disabledReason?: { message: string; items?: string[] };
  /** 当選・落選にしている応募の数 (0 なら初期化は押せない) */
  decidedCount: number;
}) {
  const [reasonOpen, setReasonOpen] = useState(false);
  const [confirm, confirmDialog] = useConfirm();
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [conditions, setConditions] = useState<DrawConditions>({
    frequent: false,
    applications: false,
    clicks: false,
    excludePast: false,
    sameGroup: false,
  });
  const [plan, setPlan] = useState<{ items: DrawItemPlan[]; shortage: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const draw = () => {
    setError(null);
    startTransition(async () => {
      const res = await previewAutoDrawAction(campaign, conditions);
      if (!res.ok) {
        setError(res.error);
        setPlan(null);
        return;
      }
      setPlan({ items: res.items, shortage: res.shortage });
    });
  };

  const apply = () => {
    if (!plan) return;
    setError(null);
    startTransition(async () => {
      const res = await applyAutoDrawAction(
        campaign,
        plan.items.map((i) => ({ index: i.index, winnerIds: i.picked.map((p) => p.id) })),
        conditions,
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      setPlan(null);
      toast.success(`当選 ${res.won} 件・落選 ${res.lost} 件にしました`);
      router.refresh();
    });
  };

  const reset = async () => {
    const ok = await confirm({
      title: '抽選結果を初期化しますか？',
      message: `${campaignLabel} の応募のうち、当選・落選にしている ${decidedCount} 件をすべて「応募中」に戻します。当選のご連絡をすでにしている場合は注意してください。`,
      confirmLabel: '初期化する',
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await resetDrawAction(campaign);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${res.reset} 件を「応募中」に戻しました`);
      router.refresh();
    });
  };

  const totalPicked = plan?.items.reduce((n, i) => n + i.picked.length, 0) ?? 0;
  const totalLosing = plan?.items.reduce((n, i) => n + i.losing, 0) ?? 0;

  return (
    <>
      {confirmDialog}
      {/* 使えないときも押せるようにして、押したら理由を説明のポップアップで出す */}
      <button
        type="button"
        className={`btn min-w-20 px-3 ${disabledReason ? 'opacity-50' : ''}`}
        aria-haspopup="dialog"
        aria-label="抽選"
        onClick={() => {
          if (disabledReason) {
            setReasonOpen(true);
            return;
          }
          setError(null);
          setPlan(null);
          setOpen(true);
        }}
      >
        <icons.dice className="h-4 w-4" />
        {spacedLabel('抽選')}
      </button>
      <button
        type="button"
        className="btn-sub ml-3 min-w-20 px-3"
        disabled={decidedCount === 0 || pending}
        title={decidedCount === 0 ? '当選・落選にしている応募はありません' : '当選・落選をすべて「応募中」に戻します'}
        onClick={reset}
      >
        <icons.reset className="h-4 w-4" />
        初期化
      </button>
      {disabledReason && (
        <InfoDialog open={reasonOpen} onClose={() => setReasonOpen(false)} title="抽選は使えません">
          <p>{disabledReason.message}</p>
          {disabledReason.items && disabledReason.items.length > 0 && (
            <ul className="mt-3 list-disc space-y-1.5 pl-5">
              {disabledReason.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </InfoDialog>
      )}
      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === ref.current && !pending) setOpen(false);
        }}
        className="m-auto max-h-[90vh] w-[min(720px,94vw)] rounded-xl p-0 text-left font-normal whitespace-normal break-words shadow-2xl backdrop:bg-slate-900/50"
      >
        {open && (
          <div className="p-6">
            <h2 className="text-base font-bold text-slate-900">抽選</h2>
            <p className="mt-1 mb-4 text-sm text-slate-500">
              条件をもとにランダムで自動抽選します。
              <br />
              （当選しなかった応募は「落選」になります）。
            </p>
            {error && <p className="error mb-4">{error}</p>}

            {!plan ? (
              <>
                <fieldset className="space-y-3">
                  <legend className="mb-2 text-sm font-semibold text-slate-700">当選条件（複数選択可。未選択の場合、全会員の当選率は同じ確率となります。）</legend>
                  {CONDITIONS.map((c) => (
                    <label key={c.key} className="flex cursor-pointer items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={conditions[c.key]}
                        onChange={(e) => setConditions((prev) => ({ ...prev, [c.key]: e.target.checked }))}
                      />
                      <span>
                        <span className="font-medium text-slate-800">{c.label}</span>
                        <span className="block text-xs text-slate-500">{c.note}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
                <div className="mt-6 flex justify-end gap-2">
                  <button type="button" className="btn-sub" onClick={() => setOpen(false)} disabled={pending}>
                    キャンセル
                  </button>
                  <button type="button" className="btn" onClick={draw} disabled={pending}>
                    {pending ? '抽選中…' : '抽選する'}
                  </button>
                </div>
              </>
            ) : (
              <>
                {plan.shortage.length > 0 && (
                  <p className="error mb-4">
                    条件で対象者が減ったため、当選者数に届かない景品があります：{plan.shortage.join('、')}
                  </p>
                )}
                <div className="max-h-[50vh] space-y-4 overflow-y-auto pr-1">
                  {plan.items.map((item) => (
                    <section key={item.index} className="rounded-lg border border-slate-200 p-3">
                      <h3 className="text-sm font-bold">
                        {item.index + 1}. {item.name}
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-500">
                        当選者数 {item.winners} 名（すでに当選 {item.alreadyWon} 名）・抽選の対象 {item.candidates} 件
                        {item.excluded > 0 && `（条件により ${item.excluded} 件を除外）`}・落選にする {item.losing} 件
                      </p>
                      {item.picked.length > 0 ? (
                        <table className="table mt-2 text-xs">
                          <thead>
                            <tr>
                              <th>当選</th>
                              <th>会員番号</th>
                              <th className="text-right">過去応募数</th>
                              <th className="text-right">過去当選数</th>
                              <th className="text-right">申し込み</th>
                              <th className="text-right">誘導</th>
                            </tr>
                          </thead>
                          <tbody>
                            {item.picked.map((p) => (
                              <tr key={p.id}>
                                <td>{p.name}</td>
                                <td className="max-w-40 truncate" title={p.memberId ?? ''}>{p.memberId ?? '—'}</td>
                                <td className="text-right">{p.pastApplied} 回</td>
                                <td className="text-right">{p.pastWon} 回</td>
                                <td className="text-right">{p.applications} 件</td>
                                <td className="text-right">{p.clicks} 回</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <p className="mt-2 text-xs text-slate-500">今回あらたに当選にする応募はありません。</p>
                      )}
                    </section>
                  ))}
                </div>
                <p className="mt-4 text-sm text-slate-700">
                  当選 <strong>{totalPicked}</strong> 件・落選 <strong>{totalLosing}</strong> 件にします。
                </p>
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button type="button" className="btn-sub" onClick={() => setPlan(null)} disabled={pending}>
                    条件を変える
                  </button>
                  <button type="button" className="btn-sub" onClick={draw} disabled={pending}>
                    やり直す
                  </button>
                  <button type="button" className="btn" onClick={apply} disabled={pending}>
                    {pending ? '反映中…' : 'この内容で当選にする'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}

/** 説明のポップアップ (メニュー上部の「?」で開く画面の説明と同じ見た目) */
function InfoDialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-auto w-[min(560px,92vw)] rounded-xl p-0 text-left font-normal whitespace-normal break-words shadow-2xl backdrop:bg-slate-900/50"
    >
      {open && (
        <div className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <icons.help className="h-5 w-5 text-brand" />
            <h2 className="text-base font-bold text-slate-900">{title}</h2>
          </div>
          <div className="text-sm leading-relaxed text-slate-700">{children}</div>
          <div className="mt-6 text-right">
            <button type="button" className="btn-sub" onClick={onClose}>閉じる</button>
          </div>
        </div>
      )}
    </dialog>
  );
}
