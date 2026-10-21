import 'server-only';
import { jwtVerify, SignJWT } from 'jose';
import { cookies } from 'next/headers';
import { deriveKey } from './secrets';

/**
 * ログイン状態は署名付き Cookie (JWT) で持つ。
 * - kadm_session … ログイン完了後 (8 時間で失効)
 * - kadm_pending … 仮パスワードでログインした後、自分のパスワードを設定するまでの途中状態 (15 分で失効)
 * どちらも ver (admin_users.session_version) を持ち、パスワード変更やアカウント停止で
 * session_version が上がると、それ以前の Cookie は使えなくなる。
 */
export const SESSION_COOKIE = 'kadm_session';
export const PENDING_COOKIE = 'kadm_pending';
const SESSION_HOURS = 8;
const PENDING_MINUTES = 15;

export type PendingStage = 'password';
export type SessionClaims = { sub: string; ver: number };
export type PendingClaims = SessionClaims & { stage: PendingStage };

const cookieBase = {
  httpOnly: true,
  // 本番・dev は HTTPS。ローカル (http://localhost) でもログインできるよう開発時だけ外す
  secure: process.env.NODE_ENV === 'production',
  // lax: Chatwork やメールのリンクから開いたとき (ほかのサイトからの移動) もログイン状態のまま開けるようにする。
  //   strict だと、ほかのサイトから来たときに Cookie が送られず、ログイン画面が出てしまう。
  //   lax でも、ほかのサイトからの POST (書き換えの操作) には Cookie が送られないので、なりすましの操作は防げる
  //   (サーバーアクションは Next.js が送信元も確かめている)
  sameSite: 'lax' as const,
  path: '/',
};

async function sign(payload: Record<string, unknown>, typ: string, seconds: number) {
  return new SignJWT({ ...payload, typ })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + seconds)
    .sign(deriveKey('session'));
}

async function verify(token: string | undefined, typ: string): Promise<Record<string, unknown> | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, deriveKey('session'), { algorithms: ['HS256'] });
    if (payload.typ !== typ || typeof payload.sub !== 'string' || typeof payload.ver !== 'number') {
      return null;
    }
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function startSession(claims: SessionClaims): Promise<void> {
  const store = await cookies();
  const token = await sign({ sub: claims.sub, ver: claims.ver }, 'session', SESSION_HOURS * 3600);
  store.set(SESSION_COOKIE, token, { ...cookieBase, maxAge: SESSION_HOURS * 3600 });
  store.delete(PENDING_COOKIE);
}

export async function readSession(): Promise<SessionClaims | null> {
  const store = await cookies();
  const p = await verify(store.get(SESSION_COOKIE)?.value, 'session');
  return p ? { sub: p.sub as string, ver: p.ver as number } : null;
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(PENDING_COOKIE);
}

export async function startPending(claims: PendingClaims): Promise<void> {
  const store = await cookies();
  const token = await sign(
    { sub: claims.sub, ver: claims.ver, stage: claims.stage },
    'pending',
    PENDING_MINUTES * 60,
  );
  store.set(PENDING_COOKIE, token, { ...cookieBase, maxAge: PENDING_MINUTES * 60 });
  store.delete(SESSION_COOKIE);
}

export async function readPending(stage: PendingStage): Promise<PendingClaims | null> {
  const store = await cookies();
  const p = await verify(store.get(PENDING_COOKIE)?.value, 'pending');
  if (!p || p.stage !== stage) return null;
  return { sub: p.sub as string, ver: p.ver as number, stage };
}
