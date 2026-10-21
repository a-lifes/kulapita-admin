import 'server-only';
import { hasRole } from './adminUsers';
import { requireAdmin } from './auth/guard';
import { query, queryOne } from './db';
import { APPLICATION_STATUS_LABEL, CONTACT_STATUS_LABEL, formatJst, label } from './format';
import { UUID_RE } from './uuid';

/**
 * お問い合わせ・申し込みの詳細の中身 (画面に出す項目と、対応状況のフォームの初期値)。
 * 詳細ページと、一覧から開く右側のパネルの両方で使う。
 */
export type CaseKind = 'contact' | 'application';
export type DetailField = { label: string; value: string; type?: 'mono' | 'multiline' | 'url' };
export type CaseDetailData = {
  kind: CaseKind;
  id: string;
  title: string;
  status: string;
  statusText: string;
  fields: DetailField[];
  form: {
    status: string;
    assignedTo: string | null;
    notes: string | null;
    admins: { id: string; display_name: string }[];
    readOnly: boolean;
  };
};

export const CASE_TITLE: Record<CaseKind, string> = { contact: 'お問い合わせ詳細', application: '申し込みの詳細' };
export const CASE_PATH: Record<CaseKind, string> = { contact: '/contacts', application: '/applications' };

type Row = Record<string, string | null>;
const address = (r: Row) => `〒${r.zipcode ?? ''} ${r.prefecture ?? ''}${r.city ?? ''}${r.building ? ` ${r.building}` : ''}`;

export async function loadCaseDetail(kind: CaseKind, id: string): Promise<CaseDetailData | null> {
  const admin = await requireAdmin();
  if (!UUID_RE.test(id)) return null;
  const table = kind === 'contact' ? 'contacts' : 'service_applications';
  const [r, { rows: admins }] = await Promise.all([
    queryOne<Row>(
      `SELECT t.*, u.external_id AS member_id, u.display_name AS member_name
       FROM ${table} t LEFT JOIN users u ON u.id = t.user_id
       WHERE t.id = :id AND t.deleted_at IS NULL`,
      { id },
    ),
    query<{ id: string; display_name: string }>(
      'SELECT id, display_name FROM admin_users WHERE deleted_at IS NULL AND is_active = TRUE ORDER BY display_name',
    ),
  ]);
  if (!r) return null;

  const member = r.member_id ? `${r.member_name ? `${r.member_name}（${r.member_id}）` : r.member_id}` : '（ログインなし）';
  const common: DetailField[] = [
    { label: 'お名前', value: r.name ?? '' },
    { label: '住所', value: address(r) },
    { label: '電話番号', value: r.phone ?? '' },
    { label: 'メールアドレス', value: r.email ?? '' },
  ];
  const mails: DetailField[] = [
    { label: '担当者宛メール送信', value: formatJst(r.staff_mail_sent_at) || '未送信' },
    { label: 'お客様宛メール送信', value: formatJst(r.user_mail_sent_at) || '未送信' },
    { label: '対応完了日時', value: formatJst(r.responded_at) || '—' },
  ];
  const fields: DetailField[] =
    kind === 'contact'
      ? [
          { label: '受付番号', value: r.reception_number ?? '', type: 'mono' },
          { label: '受付日時', value: formatJst(r.created_at) },
          { label: 'お問い合わせの種類', value: r.category ?? '' },
          { label: '会員', value: member },
          ...common,
          { label: 'お問い合わせ内容', value: r.message ?? '', type: 'multiline' },
          ...mails,
        ]
      : [
          { label: '受付番号', value: r.reception_number ?? '', type: 'mono' },
          { label: '受付日時', value: formatJst(r.created_at) },
          { label: 'サービス名', value: r.service_name ?? '' },
          { label: 'サービス提供会社', value: r.service_company ?? '' },
          { label: 'サービスのページ', value: r.service_url ?? '', type: 'url' },
          { label: '会員', value: member },
          ...common,
          { label: 'ご要望・ご質問', value: r.message ?? '', type: 'multiline' },
          ...mails,
        ];

  return {
    kind,
    id,
    title: CASE_TITLE[kind],
    status: r.status ?? 'pending',
    statusText: label(kind === 'contact' ? CONTACT_STATUS_LABEL : APPLICATION_STATUS_LABEL, r.status),
    fields,
    form: {
      status: r.status ?? 'pending',
      assignedTo: r.assigned_to,
      notes: r.admin_notes,
      admins,
      readOnly: !hasRole(admin.role, 'support'),
    },
  };
}
