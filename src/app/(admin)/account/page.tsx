import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth/guard';
import { PasswordForm } from './PasswordForm';

export const metadata: Metadata = { title: 'パスワード変更' };

export default async function AccountPage() {
  await requireAdmin();
  return (
    <>
      <h1 className="page-title">パスワード変更</h1>
      <div className="card">
        <PasswordForm />
      </div>
    </>
  );
}
