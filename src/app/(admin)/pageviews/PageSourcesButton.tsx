'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { icons } from '@/components/icons';
import type { TrafficSourceRow } from '@/lib/ga4';
import { pageSourcesAction } from './actions';

/**
 * ページ毎の表示回数: タイトルの左の円グラフのアイコン。押すと、そのページの誘導元の内訳を円グラフで出す。
 *
 * 色は誘導元ごとに固定 (並び順や件数で色が変わらないように)。よく出る 7 つに色を割り当て、
 * それ以外はまとめて「そのほか」(灰色) にする。色だけに頼らないよう、横の表に名前・回数・割合を必ず出す。
 * ※ 色は dataviz の既定の色の並びで、隣り合う色の見分けやすさ (色覚の多様性を含む) を確認済み
 */
const COLORED: { key: string; color: string }[] = [
  { key: 'direct', color: '#2a78d6' },
  { key: 'google', color: '#eb6834' },
  { key: 'yahoo', color: '#1baf7a' },
  { key: 'line', color: '#eda100' },
  { key: 'instagram', color: '#e87ba4' },
  { key: 'x', color: '#008300' },
  { key: 'referral', color: '#6250d6' },
];
const OTHER_COLOR = '#a8a29e';

type Segment = { key: string; label: string; views: number; color: string; detail?: TrafficSourceRow[] };

function toSegments(rows: TrafficSourceRow[]): Segment[] {
  const segments: Segment[] = [];
  for (const c of COLORED) {
    const row = rows.find((r) => r.key === c.key);
    if (row && row.views > 0) segments.push({ key: row.key, label: row.label, views: row.views, color: c.color });
  }
  const rest = rows.filter((r) => r.views > 0 && !COLORED.some((c) => c.key === r.key));
  if (rest.length > 0) {
    segments.push({
      key: 'rest',
      label: 'そのほか',
      views: rest.reduce((n, r) => n + r.views, 0),
      color: OTHER_COLOR,
      detail: [...rest].sort((a, b) => b.views - a.views),
    });
  }
  return segments;
}

const percent = (n: number, total: number) => `${((n / total) * 100).toFixed(1)}%`;

export function PageSourcesButton({
  path,
  title,
  query,
}: {
  path: string;
  title: string;
  /** 一覧と同じ期間・サイト */
  query: { from: string; to: string; site?: string };
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<TrafficSourceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const show = () => {
    setOpen(true);
    if (rows) return;
    setError(null);
    startTransition(async () => {
      const res = await pageSourcesAction({ path, ...query });
      if (res.ok) setRows(res.rows);
      else setError(res.error);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={show}
        className="mr-1.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded align-middle text-slate-400 hover:bg-nav-active hover:text-brand"
        aria-label={`${title || path} の誘導元の内訳を見る`}
        title="誘導元の内訳を見る"
      >
        <icons.pie className="h-4 w-4" />
      </button>
      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === ref.current) setOpen(false);
        }}
        className="m-auto w-[min(640px,94vw)] rounded-xl p-0 text-left font-normal whitespace-normal break-words shadow-2xl backdrop:bg-slate-900/50"
      >
        {open && (
          <div className="p-6">
            <div className="mb-1 flex items-center gap-2">
              <icons.pie className="h-5 w-5 text-brand" />
              <h2 className="text-base font-bold text-slate-900">誘導元の内訳</h2>
            </div>
            <p className="mb-4 truncate text-sm text-slate-500" title={path}>
              {title || '—'}（{path}）
            </p>
            {error ? (
              <p className="error">誘導元を取得できませんでした：{error}</p>
            ) : pending || !rows ? (
              <p className="py-10 text-center text-sm text-slate-500">読み込んでいます…</p>
            ) : rows.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">この期間の誘導元のデータはありません。</p>
            ) : (
              <SourcesPie segments={toSegments(rows)} />
            )}
            <div className="mt-6 text-right">
              <button type="button" className="btn-sub" onClick={() => setOpen(false)}>
                閉じる
              </button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}

/** 円グラフ (ドーナツ) と、名前・回数・割合の表。円の部分にマウスを乗せると、その誘導元の行を強調する */
function SourcesPie({ segments }: { segments: Segment[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const total = segments.reduce((n, s) => n + s.views, 0) || 1;
  const size = 200;
  const r = 90;
  const inner = 54;
  const c = size / 2;
  // 各誘導元の開始の角度 (12 時の位置から時計回り)。それまでの誘導元の合計から求める
  const startAngles = segments.map((_, i) => -Math.PI / 2 + (segments.slice(0, i).reduce((n, x) => n + x.views, 0) / total) * Math.PI * 2);
  const arcs = segments.map((s, i) => {
    const sweep = (s.views / total) * Math.PI * 2;
    const start = startAngles[i];
    const end = start + sweep;
    // 1 つだけ (100%) のときは円をそのまま描く
    if (segments.length === 1) return { s, d: null };
    const large = sweep > Math.PI ? 1 : 0;
    const p = (rad: number, radius: number) => `${c + radius * Math.cos(rad)} ${c + radius * Math.sin(rad)}`;
    const d = `M ${p(start, r)} A ${r} ${r} 0 ${large} 1 ${p(end, r)} L ${p(end, inner)} A ${inner} ${inner} 0 ${large} 0 ${p(start, inner)} Z`;
    return { s, d };
  });

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-48 w-48 shrink-0" role="img" aria-label="誘導元の割合の円グラフ">
        {arcs.map(({ s, d }) =>
          d ? (
            <path
              key={s.key}
              d={d}
              fill={s.color}
              // 隣り合う色の間に白い 2px のすき間を入れて、境目を分かりやすくする
              stroke="#fff"
              strokeWidth={2}
              opacity={hover && hover !== s.key ? 0.35 : 1}
              onMouseEnter={() => setHover(s.key)}
              onMouseLeave={() => setHover(null)}
            >
              <title>{`${s.label}：${s.views.toLocaleString()} 回（${percent(s.views, total)}）`}</title>
            </path>
          ) : (
            <circle key={s.key} cx={c} cy={c} r={(r + inner) / 2} fill="none" stroke={s.color} strokeWidth={r - inner}>
              <title>{`${s.label}：${s.views.toLocaleString()} 回（100%）`}</title>
            </circle>
          ),
        )}
        <text x={c} y={c - 4} textAnchor="middle" className="fill-slate-500 text-[11px]">
          表示回数
        </text>
        <text x={c} y={c + 16} textAnchor="middle" className="fill-slate-900 text-[18px] font-bold">
          {total.toLocaleString()}
        </text>
      </svg>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs text-slate-500">
            <th className="py-1.5 text-left font-semibold">誘導元</th>
            <th className="py-1.5 text-right font-semibold">表示回数</th>
            <th className="py-1.5 text-right font-semibold">割合</th>
          </tr>
        </thead>
        <tbody>
          {segments.map((s) => (
            <tr
              key={s.key}
              className={`border-b border-slate-100 align-top ${hover === s.key ? 'bg-nav-active' : ''}`}
              onMouseEnter={() => setHover(s.key)}
              onMouseLeave={() => setHover(null)}
            >
              <td className="py-1.5">
                <span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: s.color }} aria-hidden="true" />
                {s.label}
                {s.detail && (
                  <span className="mt-0.5 block pl-[18px] text-xs text-slate-500">
                    {s.detail.map((d) => `${d.label} ${d.views.toLocaleString()}`).join('、')}
                  </span>
                )}
              </td>
              <td className="py-1.5 text-right tabular-nums font-semibold">{s.views.toLocaleString()}</td>
              <td className="py-1.5 text-right tabular-nums text-slate-600">{percent(s.views, total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
