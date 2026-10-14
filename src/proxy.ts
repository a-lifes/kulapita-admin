import { NextRequest, NextResponse } from 'next/server';
import { isIpAllowed } from './lib/allowedIps';
import { clientIpFromHeaders } from './lib/cidr';

/**
 * すべてのリクエストの入口。
 * 1. 接続元 IP が許可一覧 (DB の admin_allowed_ips) に含まれるかを確かめる
 *    (WAF でも同じ一覧で止めているので、ここは二重チェック)
 * 2. ログイン用の Cookie が無ければログイン画面へ (中身の検証は各画面で行う)
 */
const PUBLIC_PATHS = ['/login', '/setup'];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ロードバランサーの死活監視 (社外の IP から来るため、IP チェックの対象外。DB にも触らない)
  if (pathname === '/api/health') return NextResponse.next();

  const skipIpCheck = process.env.NODE_ENV !== 'production' && process.env.ADMIN_SKIP_IP_CHECK === '1';
  if (!skipIpCheck) {
    const ip = clientIpFromHeaders(req.headers);
    let allowed = false;
    try {
      allowed = ip !== null && (await isIpAllowed(ip));
    } catch (e) {
      // DB に問い合わせられないときは通さない (安全側に倒す)
      console.error('allowed ip check failed', (e as Error).name);
      return new NextResponse('Service Unavailable', { status: 503 });
    }
    if (!allowed) return new NextResponse('Forbidden', { status: 403 });
  }

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!isPublic && !req.cookies.has('kadm_session')) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|logo.png|mark.png|login-bg.webp).*)'],
};
