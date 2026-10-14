/**
 * IPv4 の CIDR (例: 152.165.122.145/32) の解析と照合。
 * proxy (Node.js) と画面の両方から使うので、外部ライブラリに頼らず小さく実装する。
 */

/** WAF に登録できる範囲のうち、広すぎるもの (/0〜/7) は誤登録防止のため受け付けない */
export const MIN_PREFIX = 8;

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

function intToIpv4(n: number): string {
  return [24, 16, 8, 0].map((s) => Math.floor(n / 2 ** s) % 256).join('.');
}

function maskOf(prefix: number): number {
  return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

export type ParsedCidr = { network: number; prefix: number; cidr: string };

/**
 * 入力を正規化して返す。
 * - 「/」が無ければ 1 台だけ (/32) とみなす
 * - ネットワーク部以外のビットが立っているもの (例: 10.0.0.5/24) はエラーにする (意図の取り違え防止)
 */
export function parseCidr(input: string): { ok: true; value: ParsedCidr } | { ok: false; error: string } {
  const text = input.trim();
  const [ipPart, prefixPart, ...rest] = text.split('/');
  if (rest.length > 0 || !ipPart) return { ok: false, error: 'CIDR の形式で入力してください（例: 152.165.122.145/32）' };
  const ip = ipv4ToInt(ipPart);
  if (ip === null) return { ok: false, error: 'IPv4 アドレスの形式が正しくありません' };
  const prefix = prefixPart === undefined ? 32 : /^\d{1,2}$/.test(prefixPart) ? Number(prefixPart) : NaN;
  if (!Number.isInteger(prefix) || prefix > 32) return { ok: false, error: '「/」の後ろは 0〜32 の数字で入力してください' };
  if (prefix < MIN_PREFIX) return { ok: false, error: `範囲が広すぎます（/${MIN_PREFIX} 以上にしてください）` };
  const mask = maskOf(prefix);
  const network = (ip & mask) >>> 0;
  if (network !== ip) {
    return {
      ok: false,
      error: `ネットワークアドレスで入力してください（この範囲なら ${intToIpv4(network)}/${prefix}）`,
    };
  }
  return { ok: true, value: { network, prefix, cidr: `${intToIpv4(network)}/${prefix}` } };
}

export function cidrContains(cidr: string, ip: string): boolean {
  const parsed = parseCidr(cidr);
  const target = ipv4ToInt(ip);
  if (!parsed.ok || target === null) return false;
  const mask = maskOf(parsed.value.prefix);
  return ((target & mask) >>> 0) === parsed.value.network;
}

/**
 * 接続元 IP を取り出す。
 * ALB は X-Forwarded-For の「末尾」に実際の接続元を追記する。利用者が自分で付けた値は
 * 先頭側に残るだけなので、末尾を採用すれば偽装されない。
 */
export function clientIpFromHeaders(headers: Headers): string | null {
  const xff = headers.get('x-forwarded-for');
  if (!xff) return null;
  const parts = xff.split(',').map((s) => s.trim()).filter(Boolean);
  const last = parts[parts.length - 1];
  if (!last) return null;
  // IPv4-mapped IPv6 (::ffff:1.2.3.4) は IPv4 として扱う
  return last.replace(/^::ffff:/i, '');
}
