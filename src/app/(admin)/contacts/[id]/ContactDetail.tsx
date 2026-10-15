import { BackLink } from '@/components/BackLink';
import { notFound } from 'next/navigation';
import { StatusBadge } from '@/components/StatusBadge';
import { hasRole } from '@/lib/adminUsers';
import { requireAdmin } from '@/lib/auth/guard';
import { query, queryOne } from '@/lib/db';
import { CONTACT_STATUS_LABEL, formatJst, label } from '@/lib/format';
import { UUID_RE } from '@/lib/uuid';
import { ContactForm } from './ContactForm';

type Contact = Record<string, string | null>;

/**
 * 詳細の中身。ページ (/contacts/[id]) と、一覧から開く右側のパネル (@drawer) の両方で使う。
 */
export async function ContactDetail({ id, variant }: { id: string; variant: 'page' | 'drawer' }) {
  const admin = await requireAdmin();
  if (!UUID_RE.test(id)) notFound();

  const c = await queryOne<Contact>(
    `SELECT c.*, u.external_id AS member_id
     FROM contacts c LEFT JOIN users u ON u.id = c.user_id
     WHERE c.id = :id AND c.deleted_at IS NULL`,
    { id },
  );
  if (!c) notFound();
  const { rows: admins } = await query<{ id: string; display_name: string }>(
    'SELECT id, display_name FROM admin_users WHERE deleted_at IS NULL AND is_active = TRUE ORDER BY display_name',
  );

  const fields: [string, React.ReactNode][] = [
    ['受付番号', <span key="r" className="font-mono font-semibold">{c.reception_number}</span>],
    ['受付日時', formatJst(c.created_at)],
    ['お問い合わせの種類', c.category],
    ['会員番号', c.member_id ?? '（ログインなし）'],
    ['お名前', c.name],
    ['住所', `〒${c.zipcode ?? ''} ${c.prefecture ?? ''}${c.city ?? ''}${c.building ? ` ${c.building}` : ''}`],
    ['電話番号', c.phone],
    ['メールアドレス', c.email],
    ['お問い合わせ内容', <p key="m" className="whitespace-pre-wrap">{c.message}</p>],
    ['担当者宛メール送信', formatJst(c.staff_mail_sent_at) || '未送信'],
    ['お客様宛メール送信', formatJst(c.user_mail_sent_at) || '未送信'],
    ['対応完了日時', formatJst(c.responded_at) || '—'],
  ];

  return (
    <>
      {variant === 'page' ? (
        <h1 className="page-title gap-2">
          <BackLink href="/contacts" label="お問い合わせ一覧に戻る" />
          <span className="mr-1">お問い合わせ詳細</span>
          <StatusBadge value={c.status ?? ''} text={label(CONTACT_STATUS_LABEL, c.status)} />
        </h1>
      ) : (
        <div className="mb-5 flex items-center gap-3 pr-10">
          <h2 className="text-lg font-bold">お問い合わせ詳細</h2>
          <StatusBadge value={c.status ?? ''} text={label(CONTACT_STATUS_LABEL, c.status)} />
          <a href={`/contacts/${id}`} className="ml-auto text-xs text-slate-500 hover:text-brand hover:underline">
            ページで開く
          </a>
        </div>
      )}
      <div className={variant === 'page' ? 'grid grid-cols-1 gap-5 xl:grid-cols-[1fr_380px]' : 'grid grid-cols-1 gap-4'}>
        <div className="card">
          <dl className="grid grid-cols-[9rem_1fr] gap-x-4 gap-y-3 text-sm">
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
            status={c.status ?? 'pending'}
            assignedTo={c.assigned_to}
            notes={c.admin_notes}
            admins={admins}
            readOnly={!hasRole(admin.role, 'support')}
          />
        </div>
      </div>
    </>
  );
}
