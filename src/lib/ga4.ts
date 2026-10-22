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
 * GA4 Data API の runReport を呼ぶ。
 * アクセストークンが無効になっていたら (401: キーの入れ替え・無効化など) 作り直して 1 回だけやり直す。
 */
async function runReport(propertyId: string, body: Record<string, unknown>): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const token = await accessToken();
    const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    if (res.status === 401 && attempt === 1) {
      tokenCache = null;
      keyCache = null;
      continue;
    }
    return res;
  }
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

  const res = await runReport(propertyId, {
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
export async function pageViewsByPath(site: SiteKey, from: string, to: string, source?: string): Promise<PageViewRow[]> {
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) throw new Ga4NotConfiguredError('GA4 のプロパティ ID が設定されていません');
  const cacheKey = `${site}:${from}:${to}:${source ?? ''}`;
  const cached = pageCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.value;

  const res = await runReport(propertyId, {
    dateRanges: [{ startDate: from, endDate: to }],
    dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
    metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }],
    dimensionFilter: siteFilter(site, source),
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: 1000,
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

/** ログインポップアップの表示回数 (count) と表示した人数 (users) */
export type PopupStat = { count: number; users: number };
export type LoginPopupStats = { byPath: Map<string, PopupStat>; total: PopupStat };
const popupCache = new Map<string, { at: number; value: LoginPopupStats }>();

/**
 * 「ログインポップアップ」の表示回数と表示した人数 (サイトが送る GA4 イベント login_popup_view の回数・ユーザー数)。
 * ・byPath … ページ別。ログインが必要なページを直接開いた人は、そのページに数える (サイト側で page_location を付け替え)
 * ・total … 期間内の合計。人数は同じ人が複数のページで表示しても 1 人と数えるため、ページ別の合計とは一致しない
 * 同じ条件は 10 分だけ覚えておく。
 */
export async function loginPopupStats(site: SiteKey, from: string, to: string, source?: string): Promise<LoginPopupStats> {
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) throw new Ga4NotConfiguredError('GA4 のプロパティ ID が設定されていません');
  const cacheKey = `${site}:${from}:${to}:${source ?? ''}`;
  const cached = popupCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.value;

  const report = async (dimensions: { name: string }[]) => {
    const res = await runReport(propertyId, {
      dateRanges: [{ startDate: from, endDate: to }],
      dimensions,
      metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
      dimensionFilter: {
        andGroup: {
          expressions: [
            { filter: { fieldName: 'hostName', inListFilter: { values: [...SITES[site].hosts] } } },
            { filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: 'login_popup_view' } } },
            ...sourceExpressions(source),
          ],
        },
      },
      limit: 1000,
    });
    if (!res.ok) throw new Error(`GA4 から取得できませんでした（status ${res.status}）`);
    const data = (await res.json()) as {
      rows?: { dimensionValues?: { value: string }[]; metricValues: { value: string }[] }[];
    };
    return data.rows ?? [];
  };
  const [pathRows, totalRows] = await Promise.all([report([{ name: 'pagePath' }]), report([])]);
  const stat = (r?: { metricValues: { value: string }[] }): PopupStat => ({
    count: Number(r?.metricValues[0]?.value ?? 0),
    users: Number(r?.metricValues[1]?.value ?? 0),
  });
  const byPath = new Map<string, PopupStat>();
  for (const r of pathRows) {
    const path = r.dimensionValues?.[0]?.value ?? '';
    const cur = byPath.get(path);
    const add = stat(r);
    byPath.set(path, cur ? { count: cur.count + add.count, users: cur.users + add.users } : add);
  }
  const value = { byPath, total: stat(totalRows[0]) };
  popupCache.set(cacheKey, { at: Date.now(), value });
  if (popupCache.size > 100) popupCache.delete(popupCache.keys().next().value!);
  return value;
}

/* ── 誘導元 (どこから来た訪問か) ── */

type FilterExpr = Record<string, unknown>;
const channelIs = (...values: string[]): FilterExpr =>
  values.length === 1
    ? { filter: { fieldName: 'sessionDefaultChannelGroup', stringFilter: { matchType: 'EXACT', value: values[0] } } }
    : { filter: { fieldName: 'sessionDefaultChannelGroup', inListFilter: { values } } };
const sourceMatches = (regex: string): FilterExpr => ({
  filter: { fieldName: 'sessionSource', stringFilter: { matchType: 'FULL_REGEXP', value: regex, caseSensitive: false } },
});
const and = (...expressions: FilterExpr[]): FilterExpr => ({ andGroup: { expressions } });
const not = (expr: FilterExpr): FilterExpr => ({ notExpression: expr });

/** 誘導元の名前 (sessionSource) の見分け方。大文字・小文字は区別しない */
const SOURCE_RE = {
  line: '(line|line\\.me|liff\\.line\\.me|lin\\.ee)',
  instagram: '(.*instagram.*)',
  facebook: '(.*facebook.*|fb)',
  x: '(x|x\\.com|t\\.co|twitter|.*\\.twitter\\.com|twitter\\.com)',
  youtube: '(.*youtube.*|youtu\\.be)',
  google: '(google|google\\..*)',
  yahoo: '(yahoo|.*\\.yahoo\\..*|yahoo\\..*)',
  bing: '(bing|.*\\.bing\\.com|bing\\.com)',
};
const NAMED_SNS = `(${[SOURCE_RE.line, SOURCE_RE.instagram, SOURCE_RE.facebook, SOURCE_RE.x, SOURCE_RE.youtube].join('|')})`;
const NAMED_SEARCH = `(${[SOURCE_RE.google, SOURCE_RE.yahoo, SOURCE_RE.bing].join('|')})`;
const AD_CHANNELS = ['Paid Search', 'Paid Social', 'Paid Video', 'Paid Shopping', 'Paid Other', 'Display', 'Cross-network', 'Affiliates'];

/**
 * 誘導元の分類 (画面の選択肢・内訳の行)。重ならないように分けている (どの訪問もどれか 1 つに入る)。
 * ・LINE などの SNS は、誘導元の名前で見分ける (UTM 付きのリンクでも、付いていないリンクでも)
 * ・それ以外は GA4 の分類 (デフォルト チャネル グループ) で分ける
 */
export const TRAFFIC_SOURCES: { key: string; label: string; expr: FilterExpr }[] = [
  { key: 'direct', label: '直接（URL 入力・ブックマークなど）', expr: channelIs('Direct') },
  { key: 'google', label: 'Google 検索', expr: and(channelIs('Organic Search'), sourceMatches(SOURCE_RE.google)) },
  { key: 'yahoo', label: 'Yahoo! 検索', expr: and(channelIs('Organic Search'), sourceMatches(SOURCE_RE.yahoo)) },
  { key: 'bing', label: 'Bing 検索', expr: and(channelIs('Organic Search'), sourceMatches(SOURCE_RE.bing)) },
  { key: 'search', label: 'そのほかの検索', expr: and(channelIs('Organic Search'), not(sourceMatches(NAMED_SEARCH))) },
  { key: 'line', label: 'LINE', expr: sourceMatches(SOURCE_RE.line) },
  { key: 'instagram', label: 'Instagram', expr: sourceMatches(SOURCE_RE.instagram) },
  { key: 'facebook', label: 'Facebook', expr: sourceMatches(SOURCE_RE.facebook) },
  { key: 'x', label: 'X（Twitter）', expr: sourceMatches(SOURCE_RE.x) },
  { key: 'youtube', label: 'YouTube', expr: sourceMatches(SOURCE_RE.youtube) },
  { key: 'sns', label: 'そのほかの SNS', expr: and(channelIs('Organic Social'), not(sourceMatches(NAMED_SNS))) },
  { key: 'referral', label: 'ほかのサイトのリンク', expr: and(channelIs('Referral'), not(sourceMatches(NAMED_SNS))) },
  { key: 'email', label: 'メール', expr: and(channelIs('Email'), not(sourceMatches(NAMED_SNS))) },
  { key: 'ads', label: '広告', expr: and(channelIs(...AD_CHANNELS), not(sourceMatches(NAMED_SNS))) },
  {
    key: 'other',
    label: 'そのほか・分類なし',
    expr: and(
      not(channelIs('Direct', 'Organic Search', 'Organic Social', 'Referral', 'Email', ...AD_CHANNELS)),
      not(sourceMatches(NAMED_SNS)),
    ),
  },
];

/** 誘導元の分類 (画面・URL の ?source=) として正しい値か */
export function isTrafficSourceKey(value: string | undefined): value is string {
  return Boolean(value && TRAFFIC_SOURCES.some((t) => t.key === value));
}

function sourceExpressions(source?: string): FilterExpr[] {
  const t = TRAFFIC_SOURCES.find((x) => x.key === source);
  return t ? [t.expr] : [];
}

/** サイト (ホスト名) と、指定があれば誘導元で絞る条件 */
function siteFilter(site: SiteKey, source?: string) {
  const host = { filter: { fieldName: 'hostName', inListFilter: { values: [...SITES[site].hosts] } } };
  const extra = sourceExpressions(source);
  return extra.length > 0 ? { andGroup: { expressions: [host, ...extra] } } : host;
}

/** GA4 の値から、上の分類のどれに入るかを決める (TRAFFIC_SOURCES と同じ考え方) */
function classify(source: string, channel: string): string {
  const is = (re: string) => new RegExp(`^${re}$`, 'i').test(source);
  if (channel === 'Direct') return 'direct';
  if (is(SOURCE_RE.line)) return 'line';
  if (is(SOURCE_RE.instagram)) return 'instagram';
  if (is(SOURCE_RE.facebook)) return 'facebook';
  if (is(SOURCE_RE.x)) return 'x';
  if (is(SOURCE_RE.youtube)) return 'youtube';
  if (channel === 'Organic Search') {
    if (is(SOURCE_RE.google)) return 'google';
    if (is(SOURCE_RE.yahoo)) return 'yahoo';
    if (is(SOURCE_RE.bing)) return 'bing';
    return 'search';
  }
  if (channel === 'Organic Social') return 'sns';
  if (channel === 'Referral') return 'referral';
  if (channel === 'Email') return 'email';
  if (AD_CHANNELS.includes(channel)) return 'ads';
  return 'other';
}

export type TrafficSourceRow = { key: string; label: string; views: number; users: number };
const sourceCache = new Map<string, { at: number; value: TrafficSourceRow[] }>();

/**
 * 誘導元の分類ごとの表示回数・ユーザー数 (多い順。0 件の分類は出さない)。
 * 誘導元は、訪問 (セッション) の最初にどこから来たか。ユーザー数は分類ごとに足しているので目安。
 */
export async function trafficSources(site: SiteKey, from: string, to: string): Promise<TrafficSourceRow[]> {
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) throw new Ga4NotConfiguredError('GA4 のプロパティ ID が設定されていません');
  const cacheKey = `${site}:${from}:${to}`;
  const cached = sourceCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.value;

  const res = await runReport(propertyId, {
    dateRanges: [{ startDate: from, endDate: to }],
    dimensions: [{ name: 'sessionSource' }, { name: 'sessionDefaultChannelGroup' }],
    metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }],
    dimensionFilter: siteFilter(site),
    limit: 1000,
  });
  if (!res.ok) throw new Error(`GA4 から取得できませんでした（status ${res.status}）`);
  const data = (await res.json()) as {
    rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[];
  };
  const totals = new Map<string, { views: number; users: number }>();
  for (const r of data.rows ?? []) {
    const key = classify(r.dimensionValues[0].value, r.dimensionValues[1].value);
    const cur = totals.get(key) ?? { views: 0, users: 0 };
    cur.views += Number(r.metricValues[0].value);
    cur.users += Number(r.metricValues[1].value);
    totals.set(key, cur);
  }
  const value = TRAFFIC_SOURCES.filter((t) => totals.has(t.key))
    .map((t) => ({ key: t.key, label: t.label, ...totals.get(t.key)! }))
    .sort((a, b) => b.views - a.views);
  sourceCache.set(cacheKey, { at: Date.now(), value });
  if (sourceCache.size > 100) sourceCache.delete(sourceCache.keys().next().value!);
  return value;
}
