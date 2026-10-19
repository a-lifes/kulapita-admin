import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { AuthCard } from './AuthCard';
import { LAST_EMAIL_COOKIE } from './lastEmail';
import { LoginForm } from './forms';

export const metadata: Metadata = { title: 'ログイン' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  const { expired } = await searchParams;
  // 前回ログインしたメールアドレス (形式が正しいものだけ使う)
  const last = (await cookies()).get(LAST_EMAIL_COOKIE)?.value ?? '';
  const lastEmail = /^[^\s@]+@[^\s@]+$/.test(last) && last.length <= 255 ? last : '';
  return (
    <AuthCard title="ログイン">
      {expired && <p className="notice mb-4">時間が経ったため、最初からやり直してください。</p>}
      <LoginForm defaultEmail={lastEmail} />
    </AuthCard>
  );
}
