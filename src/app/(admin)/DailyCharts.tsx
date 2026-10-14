'use client';

import { useState } from 'react';
import { icons } from '@/components/icons';

/**
 * 日ごとの件数の棒グラフ (お問い合わせ・コンバージョン・メルマガ・プレゼントを 1 本ずつ縦に並べる)。
 * 件数の規模が違うので 1 つの軸にまとめず、同じ日付の横軸でそろえた別々のグラフにする。
 * 棒にマウスを乗せると、その日の件数を出す。
 */
export type DailySeries = { key: string; label: string; color: string; values: number[] };

const HEIGHT = 140;
const PAD = { top: 12, right: 12, bottom: 24, left: 36 };

function niceMax(max: number): number {
  if (max <= 4) return 4;
  const step = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (m * step >= max) return m * step;
  }
  return max;
}

/** 上だけ角を丸めた棒 (根元は四角) */
function barPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

function Chart({ series, dates, width }: { series: DailySeries; dates: string[]; width: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = dates.length;
  const innerW = width - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const max = niceMax(Math.max(0, ...series.values));
  const slot = innerW / n;
  const gap = slot >= 6 ? 2 : 0;
  const barW = Math.min(24, Math.max(1, slot * 0.7 - gap));
  const ticks = [0, max / 2, max];
  const labelEvery = Math.max(1, Math.ceil(n / 10));
  const total = series.values.reduce((a, b) => a + b, 0);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;

  return (
    <div className="relative">
      <div className="mb-1 flex items-baseline gap-3">
        <span className="h-2.5 w-2.5 self-center rounded-sm" style={{ background: series.color }} aria-hidden="true" />
        <h3 className="text-sm font-bold text-slate-800">{series.label}</h3>
        <span className="text-sm text-slate-600">
          期間合計 <strong className="text-slate-900">{total.toLocaleString()}</strong> 件
        </span>
      </div>
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={`${series.label}の日ごとの件数（期間合計 ${total} 件）`}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="#e5e7eb" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="#6b7280">
              {Number.isInteger(t) ? t : t.toFixed(1)}
            </text>
          </g>
        ))}
        {series.values.map((v, i) => {
          const x = PAD.left + i * slot + (slot - barW) / 2;
          return (
            <g key={dates[i]}>
              {v > 0 && (
                <path
                  d={barPath(x, y(v), barW, PAD.top + innerH - y(v), barW >= 8 ? 4 : 1)}
                  fill={series.color}
                  opacity={hover === null || hover === i ? 1 : 0.45}
                />
              )}
              {/* マウスの当たり判定は棒より広く (その日の列全体) */}
              <rect
                x={PAD.left + i * slot}
                y={PAD.top}
                width={slot}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
              {i % labelEvery === 0 && (
                <text x={PAD.left + i * slot + slot / 2} y={HEIGHT - 6} textAnchor="middle" fontSize={11} fill="#6b7280">
                  {dates[i].slice(5).replace('-', '/').replace(/^0/, '')}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
          style={{
            left: Math.min(width - 140, Math.max(0, PAD.left + hover * slot + slot / 2 - 60)),
            top: 4,
          }}
        >
          <p className="font-semibold text-slate-600">{dates[hover].replace(/-/g, '/')}</p>
          <p className="mt-0.5 text-slate-900">
            {series.label}：<strong>{series.values[hover].toLocaleString()}</strong> 件
          </p>
        </div>
      )}
    </div>
  );
}

/** 日ごとの件数: 「グラフ」「表」をタブで切り替える (初期表示はグラフ) */
export function DailyView({ dates, series }: { dates: string[]; series: DailySeries[] }) {
  const [tab, setTab] = useState<'chart' | 'table'>('chart');
  const tabs = [
    { key: 'chart', label: 'グラフで見る', Icon: icons.barChart },
    { key: 'table', label: '表で見る', Icon: icons.table },
  ] as const;
  return (
    <div className="mt-5">
      {/* 表示の切り替え: 押せるボタンだと分かるよう、枠付きのボタンを横に並べ、選んでいる方を塗りつぶす */}
      <div className="mb-5 flex items-center gap-3">
        <span className="text-slate-600">表示</span>
        <div role="tablist" aria-label="表示の切り替え" className="inline-flex rounded-md border border-slate-300 bg-white p-0.5">
          {tabs.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.key)}
                className={`flex cursor-pointer items-center gap-1.5 rounded px-4 py-1.5 font-semibold transition-colors ${
                  active ? 'bg-brand text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <t.Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
      {tab === 'chart' ? <DailyCharts dates={dates} series={series} /> : <DailyTable dates={dates} series={series} />}
    </div>
  );
}

function DailyCharts({ dates, series }: { dates: string[]; series: DailySeries[] }) {
  const [width, setWidth] = useState(900);
  return (
    <div
      ref={(el) => {
        if (!el) return;
        const update = () => setWidth(Math.max(320, Math.floor(el.clientWidth)));
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
      }}
      className="space-y-6"
    >
      {series.map((s) => (
        <Chart key={s.key} series={s} dates={dates} width={width} />
      ))}
    </div>
  );
}

function DailyTable({ dates, series }: { dates: string[]; series: DailySeries[] }) {
  const totals = series.map((s) => s.values.reduce((a, b) => a + b, 0));
  return (
    <div className="max-h-[32rem] overflow-y-auto rounded border border-slate-200">
      <table className="table">
        <thead>
          <tr>
            <th>日付</th>
            {series.map((s) => (
              <th key={s.key} className="text-right">{s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dates.map((d, i) => (
            <tr key={d}>
              <td>{d.replace(/-/g, '/')}</td>
              {series.map((s) => (
                <td key={s.key} className="text-right tabular-nums">{s.values[i].toLocaleString()}</td>
              ))}
            </tr>
          ))}
          <tr className="bg-slate-50 font-semibold">
            <td>期間合計</td>
            {totals.map((t, i) => (
              <td key={series[i].key} className="text-right tabular-nums">{t.toLocaleString()}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
