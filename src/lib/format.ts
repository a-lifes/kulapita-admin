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

export const NEWSLETTER_STATUS_LABEL: Record<string, string> = {
  active: '登録中',
  unsubscribed: '解除',
  bounced: '不達',
  pending: '確認待ち',
};

export const PRESENT_STATUS_LABEL: Record<string, string> = {
  applied: '応募',
  won: '当選',
  lost: '落選',
};

export const ROLE_LABEL: Record<string, string> = {
  super_admin: 'スーパー管理者',
  admin: '管理者',
  support: '担当者',
  readonly: '閲覧のみ',
};

export function label(map: Record<string, string>, key: unknown): string {
  return typeof key === 'string' ? (map[key] ?? key) : '';
}
