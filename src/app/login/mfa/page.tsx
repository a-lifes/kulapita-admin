import { redirect } from 'next/navigation';
import { readPending } from '@/lib/auth/session';
import { AuthCard } from '../AuthCard';
import { MfaForm } from '../forms';

export default async function MfaPage() {
  if (!(await readPending('mfa'))) redirect('/login?expired=1');
  return (
    <AuthCard title="2 段階認証">
      <MfaForm />
    </AuthCard>
  );
}
