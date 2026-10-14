import 'server-only';
import { createSign } from 'node:crypto';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { currentStage } from './stage';

/**
 * GA4 Data API でサイトのトップページの PV (表示回数) を読む。
 * サービスアカウントのキー (JSON) は Secrets Manager (GA4_SECRET_ARN) に入れておく。
 * 本番・開発・ローカルは同じ GA4 プロパティに入っているので、ホスト名で分けて集計する。
 */
export const SITES = {
  prod: { label: '本番（kulapita.com）', hosts: ['kulapita.com', 'www.kulapita.com'] },
  dev: { label: '開発（dev.kulapita.com）', hosts: ['dev.kulapita.com'] },
  local: { label: 'ローカル（localhost）', hosts: ['localhost'] },
} as const;
export type SiteKey = keyof typeof SITES;

/** 画面でサイトを選べるか (本番の管理画面では本番のサイトだけを出す) */
export function canChooseSite(): boolean {
  return currentStage() !== 'prod';
}

/** 画面で選んだサイト。指定が無ければ、管理画面と同じ環境のサイト。本番の管理画面は常に本番 */
export function resolveSite(value: string | undefined): SiteKey {
  if (!canChooseSite()) return 'prod';
  return value && value in SITES ? (value as SiteKey) : currentStage();
}

type ServiceAccount = { client_email: string; private_key: string };

const sm = new SecretsManagerClient({ region: process.env.AWS_REGION ?? 'ap-northeast-1' });
let keyCache: { at: number; value: ServiceAccount | null } | null = null;
let tokenCache: { token: string; expiresAt: number } | null = null;
const reportCache = new Map<string, { at: number; value: Map<string, number> }>();

export class Ga4NotConfiguredError extends Error {}

/** キーは 5 分ごとに読み直す (入れ替えても再起動は不要) */
async function serviceAccount(): Promise<ServiceAccount | null> {
  if (keyCache && Date.now() - keyCache.at < 5 * 60_000) return keyCache.value;
  let value: ServiceAccount | null = null;
  const arn = process.env.GA4_SECRET_ARN;
  if (arn) {
    const res = await sm.send(new GetSecretValueCommand({ SecretId: arn }));
    const parsed = JSON.parse(res.SecretString ?? '{}') as Partial<ServiceAccount>;
    if (parsed.client_email && parsed.private_key) {
      value = { client_email: parsed.client_email, private_key: parsed.private_key };
    }
  }
  keyCache = { at: Date.now(), value };
  return value;
}

const b64url = (v: string | Buffer) => Buffer.from(v).toString('base64url');

/** サービスアカウントで署名した JWT を Google のアクセストークンに交換する (1 時間有効) */
async function accessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) return tokenCache.token;
  const sa = await serviceAccount();
  if (!sa) throw new Ga4NotConfiguredError('GA4 のキーが設定されていません');
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/analytics.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );
  const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(sa.private_key);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${b64url(signature)}`,
    }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Google の認証に失敗しました（status ${res.status}）`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

/**
 * トップページ (/) の日ごとの PV。日付は GA4 のプロパティのタイムゾーン (日本時間) で集計される。
 * 10 分だけ覚えておく (GA4 の反映自体も数時間遅れるため)。
 */
export async function topPageViews(site: SiteKey, from: string, to: string): Promise<Map<string, number>> {
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) throw new Ga4NotConfiguredError('GA4 のプロパティ ID が設定されていません');
  const cacheKey = `${site}:${from}:${to}`;
  const cached = reportCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.value;

  const token = await accessToken();
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      dateRanges: [{ startDate: from, endDate: to }],
      dimensions: [{ name: 'date' }],
      metrics: [{ name: 'screenPageViews' }],
      dimensionFilter: {
        andGroup: {
          expressions: [
            { filter: { fieldName: 'hostName', inListFilter: { values: [...SITES[site].hosts] } } },
            { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'EXACT', value: '/' } } },
          ],
        },
      },
      limit: 1000,
    }),
    cache: 'no-store',
  });
  if (!res.ok) {
    const detail = res.status === 403 ? '（サービスアカウントに GA4 の閲覧権限があるか確認してください）' : '';
    throw new Error(`GA4 から取得できませんでした（status ${res.status}）${detail}`);
  }
  const data = (await res.json()) as {
    rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[];
  };
  const map = new Map<string, number>();
  for (const r of data.rows ?? []) {
    const d = r.dimensionValues[0].value; // YYYYMMDD
    map.set(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, Number(r.metricValues[0].value));
  }
  reportCache.set(cacheKey, { at: Date.now(), value: map });
  if (reportCache.size > 100) reportCache.delete(reportCache.keys().next().value!);
  return map;
}
