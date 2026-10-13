import 'server-only';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/**
 * AUTH_SECRET (Secrets Manager で自動生成し ECS から環境変数で渡す) から用途別の鍵を作る。
 */
function authSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error('AUTH_SECRET が未設定か短すぎます');
  return s;
}

export function deriveKey(purpose: string): Uint8Array {
  return new Uint8Array(hkdfSync('sha256', authSecret(), 'kulapita-admin', purpose, 32));
}

/** 2 段階認証の秘密鍵を DB に保存する前に暗号化する (AES-256-GCM) */
export function encryptText(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey('mfa-secret'), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), body.toString('base64url')].join(':');
}

export function decryptText(stored: string): string {
  const [version, iv, tag, body] = stored.split(':');
  if (version !== 'v1' || !iv || !tag || !body) throw new Error('暗号化データの形式が不正です');
  const decipher = createDecipheriv('aes-256-gcm', deriveKey('mfa-secret'), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
}
