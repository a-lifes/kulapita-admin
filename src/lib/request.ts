import 'server-only';
import { headers } from 'next/headers';
import { clientIpFromHeaders } from './cidr';

export async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  return {
    ip: clientIpFromHeaders(h),
    userAgent: h.get('user-agent')?.slice(0, 500) ?? null,
  };
}
