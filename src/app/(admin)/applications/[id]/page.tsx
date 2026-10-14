import type { Metadata } from 'next';
import { BackLink } from '@/components/BackLink';
import { notFound } from 'next/navigation';
import { StatusBadge } from '@/components/StatusBadge';
import { hasRole } from '@/lib/adminUsers';
import { requireAdmin } from '@/lib/auth/guard';
import { query, queryOne } from '@/lib/db';
import { CONTACT_STATUS_LABEL, formatJst, label } from '@/lib/format';
import { UUID_RE } from '@/lib/uuid';
import { ContactForm } from '../../contacts/[id]/ContactForm';
import { updateApplicationAction } from './actions';

export const metadata: Metadata = { title: 'コンバージョン（申し込み）詳細' };

type Application = Record<string, string | null>;

export default async function ApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const s = await queryOne<Application>(
    `SELECT s.*, u.external_id AS member_id
     FROM service_applications s LEFT JOIN users u ON u.id = s.user_id
     WHERE s.id = :id AND s.deleted_at IS NULL`,
    { id },
  );
  if (!s) notFound();
  const { rows: admins } = await query<{ id: string; display_name: string }>(
    'SELECT id, display_name FROM admin_users WHERE deleted_at IS NULL AND is_active = TRUE ORDER BY display_name',
  );

  const fields: [string, React.ReactNode][] = [
    ['受付番号', <span key="r" className="font-mono font-semibold">{s.reception_number}</span>],
    ['受付日時', formatJst(s.created_at)],
    ['サービス名', s.service_name],
    ['サービス提供会社', s.service_company],
    [
      'サービスのページ',
      s.service_url ? (
        <a key="u" className="break-all text-brand underline" href={s.service_url} target="_blank" rel="noreferrer noopener">
          {s.service_url}
        </a>
      ) : null,
    ],
    ['会員番号', s.member_id ?? '（ログインなし）'],
    ['お名前', s.name],
    ['住所', `〒${s.zipcode ?? ''} ${s.prefecture ?? ''}${s.city ?? ''}${s.building ? ` ${s.building}` : ''}`],
    ['電話番号', s.phone],
    ['メールアドレス', s.email],
    ['ご要望・ご質問', s.message ? <p key="m" className="whitespace-pre-wrap">{s.message}</p> : null],
    ['担当者宛メール送信', formatJst(s.staff_mail_sent_at) || '未送信'],
    ['お客様宛メール送信', formatJst(s.user_mail_sent_at) || '未送信'],
    ['対応完了日時', formatJst(s.responded_at) || '—'],
  ];

  return (
    <>
      <h1 className="page-title gap-2">
        <BackLink href="/applications" label="コンバージョン（申し込み）一覧に戻る" />
        <span className="mr-1">申し込みの詳細</span>
        <StatusBadge value={s.status ?? ''} text={label(CONTACT_STATUS_LABEL, s.status)} />
      </h1>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_380px]">
        <div className="card">
          <dl className="grid grid-cols-[10rem_1fr] gap-x-4 gap-y-3 text-sm">
            {fields.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="font-semibold text-slate-600">{k}</dt>
                <dd className="break-words">{v ?? '—'}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="card self-start">
          <h2 className="mb-4 font-bold">対応状況</h2>
          <ContactForm
            id={id}
            status={s.status ?? 'pending'}
            assignedTo={s.assigned_to}
            notes={s.admin_notes}
            admins={admins}
            readOnly={!hasRole(admin.role, 'support')}
            action={updateApplicationAction}
          />
        </div>
      </div>
    </>
  );
}
