const COLORS: Record<string, string> = {
  pending: 'bg-red-100 text-red-800',
  in_progress: 'bg-amber-100 text-amber-800',
  completed: 'bg-emerald-100 text-emerald-800',
  archived: 'bg-slate-200 text-slate-700',
  registered: 'bg-emerald-100 text-emerald-800',
  excluded: 'bg-slate-200 text-slate-700',
  applied: 'bg-sky-100 text-sky-800',
  won: 'bg-emerald-100 text-emerald-800',
  lost: 'bg-slate-200 text-slate-700',
};

export function StatusBadge({ value, text }: { value: string; text: string }) {
  return <span className={`badge ${COLORS[value] ?? 'bg-slate-100 text-slate-700'}`}>{text}</span>;
}
