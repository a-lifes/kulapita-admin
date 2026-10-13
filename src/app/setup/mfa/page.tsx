import { redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { findAdminById } from '@/lib/adminUsers';
import { decryptText, encryptText } from '@/lib/auth/secrets';
import { readPending } from '@/lib/auth/session';
import { generateTotpSecret, otpauthUrl } from '@/lib/auth/totp';
import { query } from '@/lib/db';
import { AuthCard } from '../../login/AuthCard';
import { SetupMfaForm } from '../../login/forms';

export default async function SetupMfaPage() {
  const pending = await readPending('mfa_setup');
  if (!pending) redirect('/login?expired=1');
  let user = await findAdminById(pending.sub);
  if (!user || user.session_version !== pending.ver || user.mfa_enabled) redirect('/login?expired=1');

  // まだ鍵が無ければ作って保存する (有効化はコードの確認後)
  if (!user.mfa_secret) {
    await query(
      'UPDATE admin_users SET mfa_secret = :secret WHERE id = :id AND mfa_secret IS NULL AND mfa_enabled_at IS NULL',
      { secret: encryptText(generateTotpSecret()), id: user.id },
    );
    user = await findAdminById(pending.sub);
    if (!user?.mfa_secret) redirect('/login?expired=1');
  }

  const secret = decryptText(user.mfa_secret);
  const stage = process.env.STAGE ?? 'local';
  const issuer = stage === 'prod' ? 'kulapita admin' : `kulapita admin (${stage})`;
  const qr = await QRCode.toDataURL(otpauthUrl(secret, user.email, issuer), { margin: 1, width: 220 });

  return (
    <AuthCard title="2 段階認証の設定">
      <ol className="mb-4 list-decimal space-y-2 pl-5 text-sm">
        <li>
          スマートフォンの認証アプリ (Google Authenticator / Microsoft Authenticator など) で、下の QR コードを読み取ってください。
        </li>
        <li>アプリに表示された 6 桁のコードを入力してください。</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qr} alt="認証アプリ登録用の QR コード" className="mx-auto mb-2 h-[220px] w-[220px]" />
      <details className="mb-4 text-center text-xs text-slate-500">
        <summary className="cursor-pointer">QR コードを読み取れない場合</summary>
        <p className="mt-2 break-all font-mono text-sm text-slate-700">{secret.match(/.{1,4}/g)?.join(' ')}</p>
      </details>
      <SetupMfaForm />
    </AuthCard>
  );
}
