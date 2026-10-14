/**
 * 表示用の整形。DB の日時は UTC の「YYYY-MM-DD HH:MM:SS」で返るので、日本時間に直して表示する。
 */
const jst = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function parseDbDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value) return null;
  const d = new Date(`${value.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatJst(value: unknown): string {
  const d = parseDbDate(value);
  return d ? jst.format(d) : '';
}

export const CONTACT_STATUS_LABEL: Record<string, string> = {
  pending: '未対応',
  in_progress: '対応中',
  completed: '対応済み',
  archived: 'アーカイブ',
};

export const CONTACT_ROUTE_LABEL: Record<string, string> = {
  inquiry: '一般のお問い合わせ',
  publish: 'サービス掲載',
  service: 'サービスの申し込み',
};

/** 誘導ボタンの場所 */
export const PLACEMENT_LABEL: Record<string, string> = {
  hero: 'ページ上部',
  fixed: '画面下の固定バー',
};

/** メルマガの状態 (配信は別システム。サイトで登録されたら未対応、担当者が配信システムに登録したら登録済) */
export const NEWSLETTER_STATUS_LABEL: Record<string, string> = {
  pending: '未対応',
  registered: '登録済',
  excluded: '登録対象外',
};

/** 一覧の行で状態を切り替えるプルダウンの色 */
export const NEWSLETTER_STATUS_STYLE: Record<string, string> = {
  pending: 'border-red-300 bg-red-50 text-red-800',
  registered: 'border-emerald-400 bg-emerald-50 text-emerald-800',
  excluded: 'border-slate-300 bg-slate-100 text-slate-700',
};
export const PRESENT_STATUS_STYLE: Record<string, string> = {
  applied: 'border-sky-300 bg-sky-50 text-sky-800',
  won: 'border-emerald-400 bg-emerald-50 text-emerald-800',
  lost: 'border-slate-300 bg-slate-100 text-slate-700',
};

export const PRESENT_STATUS_LABEL: Record<string, string> = {
  applied: '応募',
  won: '当選',
  lost: '落選',
};

export const ROLE_LABEL: Record<string, string> = {
  super_admin: '上級管理者',
  admin: '管理者',
  support: '一般',
  readonly: '閲覧のみ',
};

export function label(map: Record<string, string>, key: unknown): string {
  return typeof key === 'string' ? (map[key] ?? key) : '';
}
