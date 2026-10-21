/** 状態の表示 (色の点 + 文字)。色は状態の値ごとに決める */
const DOT: Record<string, string> = {
  pending: 'bg-rose-500',
  in_progress: 'bg-amber-500',
  completed: 'bg-emerald-500',
  archived: 'bg-slate-400',
  contracted: 'bg-indigo-500',
  registered: 'bg-emerald-500',
  excluded: 'bg-amber-500',
  applied: 'bg-sky-500',
  won: 'bg-emerald-500',
  lost: 'bg-slate-400',
};

export function StatusBadge({ value, text }: { value: string; text: string }) {
  return (
    <span className="badge">
      <span className={`badge-dot ${DOT[value] ?? 'bg-slate-400'}`} aria-hidden="true" />
      {text}
    </span>
  );
}
