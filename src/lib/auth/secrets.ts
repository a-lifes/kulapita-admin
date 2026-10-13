import 'server-only';
import { hkdfSync } from 'node:crypto';

/**
 * AUTH_SECRET (Secrets Manager で自動生成し ECS から環境変数で渡す) から用途別の鍵を作る。
 * (今はログイン Cookie の署名にだけ使う)
 */
function authSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error('AUTH_SECRET が未設定か短すぎます');
  return s;
}

export function deriveKey(purpose: string): Uint8Array {
  return new Uint8Array(hkdfSync('sha256', authSecret(), 'kulapita-admin', purpose, 32));
}
