import { ContactForm } from '@/app/(admin)/contacts/[id]/ContactForm';
import { updateContactAction } from '@/app/(admin)/contacts/[id]/actions';
import { updateApplicationAction } from '@/app/(admin)/applications/[id]/actions';
import type { CaseDetailData } from '@/lib/caseDetail';

/**
 * お問い合わせ・申し込みの詳細の表示 (項目の一覧 + 対応状況のフォーム)。
 * 詳細ページ (サーバー) と右側のパネル (ブラウザ) の両方で使うため、ここでは状態を持たない。
 */
export function CaseDetailView({
  data,
  layout,
  onSaved,
}: {
  data: CaseDetailData;
  layout: 'page' | 'drawer';
  /** 保存できたとき (右側のパネルで中身を読み直す) */
  onSaved?: () => void;
}) {
  return (
    <div className={layout === 'page' ? 'grid grid-cols-1 gap-5 xl:grid-cols-[1fr_380px]' : 'grid grid-cols-1 gap-4'}>
      <div className="card">
        <dl className="grid grid-cols-[9rem_1fr] gap-x-4 gap-y-3 text-sm">
          {data.fields.map((f) => (
            <div key={f.label} className="contents">
              <dt className="font-semibold text-slate-600">{f.label}</dt>
              <dd className="min-w-0 break-words">
                {!f.value ? (
                  '—'
                ) : f.type === 'mono' ? (
                  <span className="font-semibold tracking-wide">{f.value}</span>
                ) : f.type === 'multiline' ? (
                  <p className="whitespace-pre-wrap">{f.value}</p>
                ) : f.type === 'url' ? (
                  <a className="break-all text-brand hover:underline" href={f.value} target="_blank" rel="noreferrer noopener">
                    {f.value}
                  </a>
                ) : (
                  f.value
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="card self-start">
        <h2 className="mb-4 font-bold">対応状況</h2>
        <ContactForm
          id={data.id}
          status={data.form.status}
          assignedTo={data.form.assignedTo}
          notes={data.form.notes}
          admins={data.form.admins}
          readOnly={data.form.readOnly}
          action={data.kind === 'contact' ? updateContactAction : updateApplicationAction}
          onSaved={onSaved}
        />
      </div>
    </div>
  );
}
