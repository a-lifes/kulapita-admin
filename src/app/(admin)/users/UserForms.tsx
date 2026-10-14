'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useConfirm } from '@/components/ConfirmDialog';
import { icons } from '@/components/icons';
import { toast } from '@/components/Toaster';
import { ROLE_LABEL } from '@/lib/format';
import {
  createAdminAction,
  deleteAdminAction,
  resetPasswordAction,
  updateAdminAction,
  UserActionState,
} from './actions';

const ROLES = ['super_admin', 'admin', 'support', 'readonly'];

function Result({ state }: { state: UserActionState }) {
  if (!state) return null;
  return (
    <div className="space-y-2">
      {state.error && <p className="error">{state.error}</p>}
      {state.message && <p className="notice">{state.message}</p>}
      {state.tempPassword && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="font-semibold">仮パスワード（この画面を閉じると二度と表示されません）</p>
          <p className="my-2 select-all font-mono text-lg">{state.tempPassword}</p>
          <p className="text-xs text-slate-600">
            本人に口頭や社内チャットの個別メッセージなど、メール以外の方法で伝えてください。初回ログイン時にパスワードの変更を求められます。
          </p>
        </div>
      )}
    </div>
  );
}

/** 画面中央のダイアログ (編集・仮パスワード表示で共用) */
function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-auto w-[min(520px,92vw)] rounded-xl p-0 text-left font-normal whitespace-normal break-words shadow-2xl backdrop:bg-slate-900/50"
    >
      {open && children}
    </dialog>
  );
}

type Row = { id: string; display_name: string; email: string; role: string; is_active: boolean };

/** 編集 (鉛筆アイコン → 表示名・権限・有効/停止を変更) */
export function EditAdminButton({ user, isSelf }: { user: Row; isSelf: boolean }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <button
        type="button"
        className="rounded-md p-2 text-slate-500 hover:bg-nav-active hover:text-brand"
        aria-label={`${user.display_name} を編集`}
        title="編集"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <icons.pencil className="h-5 w-5" />
      </button>
      <Modal open={open} onClose={() => setOpen(false)}>
        <form
          className="p-6"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(async () => {
              const res = await updateAdminAction(user.id, undefined, fd);
              if (res?.error) {
                setError(res.error);
                return;
              }
              setOpen(false);
              if (res?.message) toast.success(`${user.display_name}：${res.message}`);
            });
          }}
        >
          <h2 className="text-base font-bold text-slate-900">アカウントの編集</h2>
          <p className="mt-1 mb-4 text-sm text-slate-500">{user.email}</p>
          {error && <p className="error mb-4">{error}</p>}
          <div className="space-y-4">
            <div>
              <label className="label" htmlFor={`name-${user.id}`}>表示名</label>
              <input className="input" id={`name-${user.id}`} name="display_name" defaultValue={user.display_name} maxLength={100} required autoFocus />
            </div>
            <div>
              <label className="label" htmlFor={`role-${user.id}`}>権限</label>
              <select className="input" id={`role-${user.id}`} name="role" defaultValue={user.role} disabled={isSelf}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                ))}
              </select>
              {isSelf && <input type="hidden" name="role" value={user.role} />}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="is_active" defaultChecked={user.is_active} disabled={isSelf} />
              有効（外すとログインできなくなります）
              {isSelf && user.is_active && <input type="hidden" name="is_active" value="on" />}
            </label>
            {isSelf && <p className="text-xs text-slate-500">自分自身の権限変更・停止はできません。</p>}
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button type="button" className="btn-sub" onClick={() => setOpen(false)}>キャンセル</button>
            <button className="btn" disabled={pending}>{pending ? '保存中…' : '保存'}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/** 仮パスワード再発行 (鍵アイコン → 確認 → 発行した仮パスワードをダイアログで表示) */
export function ResetPasswordButton({ user }: { user: Row }) {
  const [busy, setBusy] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [confirm, dialog] = useConfirm();
  return (
    <>
      {dialog}
      <button
        type="button"
        className="rounded-md p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
        disabled={busy}
        aria-label={`${user.display_name} の仮パスワードを再発行`}
        title="仮パスワード再発行"
        onClick={async () => {
          const ok = await confirm({
            title: '仮パスワードを発行しますか？',
            message: `${user.display_name} さんの今のパスワードは使えなくなります。ロックされている場合は解除されます。`,
            confirmLabel: '発行する',
            danger: true,
          });
          if (!ok) return;
          setBusy(true);
          try {
            const res = await resetPasswordAction(user.id);
            if (res?.error) toast.error(res.error);
            if (res?.tempPassword) setTempPassword(res.tempPassword);
          } finally {
            setBusy(false);
          }
        }}
      >
        <icons.key className="h-5 w-5" />
      </button>
      <Modal open={tempPassword !== null} onClose={() => setTempPassword(null)}>
        <div className="p-6">
          <h2 className="mb-4 text-base font-bold text-slate-900">{user.display_name} さんの仮パスワード</h2>
          <Result state={{ tempPassword: tempPassword ?? undefined }} />
          <div className="mt-6 text-right">
            <button type="button" className="btn-sub" onClick={() => setTempPassword(null)}>閉じる</button>
          </div>
        </div>
      </Modal>
    </>
  );
}

/** 追加 (＋ボタン → 画面中央のダイアログで入力 → 発行した仮パスワードを同じダイアログで表示) */
export function CreateAdminButton() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<UserActionState>(undefined);
  const [pending, startTransition] = useTransition();
  const close = () => {
    setOpen(false);
    setCreated(undefined);
  };
  return (
    <>
      <button
        type="button"
        className="btn"
        onClick={() => {
          setError(null);
          setCreated(undefined);
          setOpen(true);
        }}
      >
        <icons.plus className="h-4 w-4" />
        追加
      </button>
      <Modal open={open} onClose={close}>
        {created?.tempPassword ? (
          <div className="p-6">
            <h2 className="mb-4 text-base font-bold text-slate-900">アカウントを追加しました</h2>
            <Result state={created} />
            <div className="mt-6 text-right">
              <button type="button" className="btn-sub" onClick={close}>閉じる</button>
            </div>
          </div>
        ) : (
          <form
            className="p-6"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              startTransition(async () => {
                const res = await createAdminAction(undefined, fd);
                if (res?.error) {
                  setError(res.error);
                  return;
                }
                setError(null);
                setCreated(res);
              });
            }}
          >
            <h2 className="mb-4 text-base font-bold text-slate-900">アカウントの追加</h2>
            {error && <p className="error mb-4">{error}</p>}
            <div className="space-y-4">
              <div>
                <label className="label" htmlFor="new-email">メールアドレス</label>
                <input className="input" id="new-email" name="email" type="email" required autoFocus />
              </div>
              <div>
                <label className="label" htmlFor="new-name">表示名</label>
                <input className="input" id="new-name" name="display_name" required maxLength={100} />
              </div>
              <div>
                <label className="label" htmlFor="new-role">権限</label>
                <select className="input" id="new-role" name="role" defaultValue="support">
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-slate-500">追加すると仮パスワードを発行します。初回ログイン時にパスワードの変更を求められます。</p>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" className="btn-sub" onClick={close}>キャンセル</button>
              <button className="btn" disabled={pending}>{pending ? '追加中…' : '追加'}</button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

/** 削除 (ゴミ箱アイコン → 確認ダイアログ → 結果はスナックバー) */
export function DeleteAdminButton({ user, isSelf }: { user: Row; isSelf: boolean }) {
  const [busy, setBusy] = useState(false);
  const [confirm, dialog] = useConfirm();
  return (
    <>
      {dialog}
      <button
        type="button"
        className="rounded-md p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
        disabled={busy || isSelf}
        aria-label={`${user.display_name} を削除`}
        title={isSelf ? '自分自身は削除できません' : '削除'}
        onClick={async () => {
          const ok = await confirm({
            title: 'アカウントを削除しますか？',
            message: (
              <>
                <p className="font-semibold text-slate-900">
                  {user.display_name}
                  <span className="ml-2 font-normal text-slate-600">{user.email}</span>
                </p>
                <p className="mt-2">削除すると、このアカウントではログインできなくなります。操作ログや担当者の記録は残ります。</p>
              </>
            ),
            confirmLabel: '削除する',
            danger: true,
          });
          if (!ok) return;
          setBusy(true);
          try {
            const res = await deleteAdminAction(user.id);
            if (res?.error) toast.error(res.error);
            if (res?.message) toast.success(res.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <icons.trash className="h-5 w-5" />
      </button>
    </>
  );
}
