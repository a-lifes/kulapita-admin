import { redirect } from 'next/navigation';
import { readPending } from '@/lib/auth/session';
import { AuthCard } from '../../login/AuthCard';
import { SetupPasswordForm } from '../../login/forms';

export default async function SetupPasswordPage() {
  if (!(await readPending('password'))) redirect('/login?expired=1');
  return (
    <AuthCard title="パスワードの設定">
      <SetupPasswordForm />
    </AuthCard>
  );
}
