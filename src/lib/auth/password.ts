import 'server-only';
import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';

const COST = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** 存在しないメールアドレスでも同じだけ時間をかけ、登録の有無を推測されにくくする */
const DUMMY_HASH = '$2b$12$M4TMdmPo1Eiynjqt5I7Zfunk1NrIK75hVIfcGxf.fiAMI/SoNSauq';
export async function burnPasswordCheck(plain: string): Promise<void> {
  await bcrypt.compare(plain, DUMMY_HASH).catch(() => false);
}

/**
 * パスワードの条件: 12 文字以上 72 バイト以内、英字と数字を両方含む。
 * (bcrypt は 72 バイトを超えた部分を無視するため上限を設ける)
 */
export function validateNewPassword(plain: string, email: string): string | null {
  if (plain.length < 12) return 'パスワードは 12 文字以上にしてください';
  if (Buffer.byteLength(plain, 'utf8') > 72) return 'パスワードが長すぎます（半角 72 文字まで）';
  if (!/[A-Za-z]/.test(plain) || !/\d/.test(plain)) return '英字と数字を両方含めてください';
  if (plain.toLowerCase().includes(email.split('@')[0].toLowerCase())) {
    return 'メールアドレスの一部をパスワードに含めないでください';
  }
  return null;
}

/** 仮パスワード (見間違えやすい文字を除いた 16 文字) */
export function generateTemporaryPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  while (out.length < 16) out += chars[randomInt(chars.length)];
  // 英字と数字を必ず含める
  return /\d/.test(out) && /[A-Za-z]/.test(out) ? out : generateTemporaryPassword();
}
