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
  prod: { label: '本番（kulapita.com）', hosts: ['kulapita.com', 'www.kulapita.com'], origin: 'https://kulapita.com' },
  dev: { label: '開発（dev.kulapita.com）', hosts: ['dev.kulapita.com'], origin: 'https://dev.kulapita.com' },
  local: { label: 'ローカル（localhost）', hosts: ['localhost'], origin: 'http://localhost:3000' },
} as const;
export type SiteKey = keyof typeof SITES;

/**
 * 画面でサイトを選べるか。本番・開発の管理画面は、それぞれ同じ環境のサイトだけを出す。
 * ローカルの管理画面だけ、動作確認のために本番・開発・ローカルを切り替えられる。
 */
export function canChooseSite(): boolean {
  return currentStage() === 'local';
}

/** 画面で選んだサイト。指定が無い・選べない環境では、管理画面と同じ環境のサイト */
export function resolveSite(value: string | undefined): SiteKey {
  if (!canChooseSite()) return currentStage();
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

/** ページ別の表示回数 (1 行分) */
export type PageViewRow = { path: string; title: string; views: number; users: number };
const pageCache = new Map<string, { at: number; value: PageViewRow[] }>();

/**
 * 期間内にアクセスがあったページの表示回数・ユーザー数 (多い順に最大 1000 ページ)。
 * GA4 Data API に毎回問い合わせるが、同じ条件は 10 分だけ覚えておく (GA4 の反映も数時間遅れるため)。
 * 同じページでタイトルが途中で変わった場合は 1 行にまとめ、表示回数が多い方のタイトルを使う。
 */
export async function pageViewsByPath(site: SiteKey, from: string, to: string): Promise<PageViewRow[]> {
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) throw new Ga4NotConfiguredError('GA4 のプロパティ ID が設定されていません');
  const cacheKey = `${site}:${from}:${to}`;
  const cached = pageCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.value;

  const token = await accessToken();
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      dateRanges: [{ startDate: from, endDate: to }],
      dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
      metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }],
      dimensionFilter: { filter: { fieldName: 'hostName', inListFilter: { values: [...SITES[site].hosts] } } },
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
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
  const byPath = new Map<string, PageViewRow & { titleViews: number }>();
  for (const r of data.rows ?? []) {
    const path = r.dimensionValues[0].value;
    const title = r.dimensionValues[1].value;
    const views = Number(r.metricValues[0].value);
    const users = Number(r.metricValues[1].value);
    const cur = byPath.get(path);
    if (!cur) {
      byPath.set(path, { path, title, views, users, titleViews: views });
    } else {
      cur.views += views;
      cur.users += users; // タイトル違いの行を足すため、ユーザー数は目安 (重複を含むことがある)
      if (views > cur.titleViews) {
        cur.title = title;
        cur.titleViews = views;
      }
    }
  }
  const value = [...byPath.values()]
    .map(({ path, title, views, users }) => ({ path, title, views, users }))
    .sort((a, b) => b.views - a.views);
  pageCache.set(cacheKey, { at: Date.now(), value });
  if (pageCache.size > 100) pageCache.delete(pageCache.keys().next().value!);
  return value;
}
