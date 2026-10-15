'use client';

import { useActionState, useEffect } from 'react';
import { CONTACT_STATUS_LABEL } from '@/lib/format';
import { ContactFormState, updateContactAction } from './actions';

const STATUSES = ['pending', 'in_progress', 'completed', 'archived'];

export function ContactForm({
  id,
  status,
  assignedTo,
  notes,
  admins,
  readOnly,
  action: save = updateContactAction,
  onSaved,
}: {
  id: string;
  status: string;
  assignedTo: string | null;
  notes: string | null;
  admins: { id: string; display_name: string }[];
  readOnly: boolean;
  /** 保存処理 (お問い合わせ・サービスの申し込みで切り替える) */
  action?: (id: string, prev: ContactFormState, formData: FormData) => Promise<ContactFormState>;
  /** 保存できたときに呼ぶ */
  onSaved?: () => void;
}) {
  const [state, action, pending] = useActionState<ContactFormState, FormData>(
    save.bind(null, id),
    undefined,
  );
  useEffect(() => {
    if (state?.saved) onSaved?.();
  }, [state, onSaved]);
  return (
    <form action={action} className="space-y-4">
      {state?.error && <p className="error">{state.error}</p>}
      {state?.saved && <p className="notice">保存しました。</p>}
      <div>
        <label className="label" htmlFor="status">対応状況</label>
        <select className="input" id="status" name="status" defaultValue={status} disabled={readOnly}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{CONTACT_STATUS_LABEL[s]}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="assigned_to">担当者</label>
        <select className="input" id="assigned_to" name="assigned_to" defaultValue={assignedTo ?? ''} disabled={readOnly}>
          <option value="">未設定</option>
          {admins.map((a) => (
            <option key={a.id} value={a.id}>{a.display_name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="admin_notes">対応メモ（社内用）</label>
        <textarea
          className="input min-h-40"
          id="admin_notes"
          name="admin_notes"
          defaultValue={notes ?? ''}
          maxLength={5000}
          disabled={readOnly}
        />
      </div>
      {!readOnly && <button className="btn" disabled={pending}>{pending ? '保存中…' : '保存'}</button>}
    </form>
  );
}
