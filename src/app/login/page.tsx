import type { Metadata } from 'next';
import { AuthCard } from './AuthCard';
import { LoginForm } from './forms';

export const metadata: Metadata = { title: 'ログイン' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  const { expired } = await searchParams;
  return (
    <AuthCard title="ログイン">
      {expired && <p className="notice mb-4">時間が経ったため、最初からやり直してください。</p>}
      <LoginForm />
    </AuthCard>
  );
}
