import 'server-only';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

/**
 * microCMS (サイトのプレゼント情報) を読む。当選者数 (items[].winners) を知るために使う。
 * API キーは Secrets Manager (MICROCMS_SECRET_ARN) に { serviceDomain, apiKey } で入れておく。
 * キーを入れ替えてもアプリの再起動は不要 (5 分ごとに読み直す)。
 */
type Credentials = { serviceDomain: string; apiKey: string };
type RawCampaign = {
  id: string;
  slug?: string;
  month?: string;
  items?: { name?: string; winners?: number | null; image?: { url?: string } | null }[];
};

export type CampaignItems = { name: string; winners: number | null; imageUrl: string | null }[];

const sm = new SecretsManagerClient({ region: process.env.AWS_REGION ?? 'ap-northeast-1' });
let credCache: { at: number; value: Credentials | null } | null = null;
let campaignCache: { at: number; value: Map<string, CampaignItems> } | null = null;

async function credentials(): Promise<Credentials | null> {
  if (credCache && Date.now() - credCache.at < 5 * 60_000) return credCache.value;
  let value: Credentials | null = null;
  const arn = process.env.MICROCMS_SECRET_ARN;
  if (arn) {
    const res = await sm.send(new GetSecretValueCommand({ SecretId: arn }));
    const parsed = JSON.parse(res.SecretString ?? '{}') as Partial<Credentials>;
    if (parsed.serviceDomain && parsed.apiKey) value = { serviceDomain: parsed.serviceDomain, apiKey: parsed.apiKey };
  } else if (process.env.MICROCMS_SERVICE_DOMAIN && process.env.MICROCMS_API_KEY) {
    // ローカル開発用
    value = { serviceDomain: process.env.MICROCMS_SERVICE_DOMAIN, apiKey: process.env.MICROCMS_API_KEY };
  }
  credCache = { at: Date.now(), value };
  return value;
}

/** サイト (kulapita/src/libs/presents.ts の campaignKey) と同じ規則でキーを作る */
function campaignKey(c: RawCampaign): string {
  if (c.slug && c.slug.trim()) return c.slug.trim();
  if (c.month) {
    const d = new Date(c.month);
    if (!Number.isNaN(d.getTime())) {
      const j = new Date(d.getTime() + 9 * 3600_000);
      return `${j.getUTCFullYear()}-${String(j.getUTCMonth() + 1).padStart(2, '0')}`;
    }
  }
  return c.id;
}

export class MicrocmsNotConfiguredError extends Error {}

/** キャンペーン (月のキー) → 景品ごとの名前・当選者数。1 分だけ覚えておく */
async function campaigns(): Promise<Map<string, CampaignItems>> {
  if (campaignCache && Date.now() - campaignCache.at < 60_000) return campaignCache.value;
  const cred = await credentials();
  if (!cred) throw new MicrocmsNotConfiguredError('microCMS の API キーが設定されていません');
  const map = new Map<string, CampaignItems>();
  for (let offset = 0; ; offset += 100) {
    const url = new URL(`https://${cred.serviceDomain}.microcms.io/api/v1/presents`);
    url.searchParams.set('limit', '100');
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('fields', 'id,slug,month,items');
    const res = await fetch(url, { headers: { 'X-MICROCMS-API-KEY': cred.apiKey }, cache: 'no-store' });
    if (!res.ok) throw new Error(`microCMS から取得できませんでした（status ${res.status}）`);
    const data = (await res.json()) as { contents: RawCampaign[]; totalCount: number };
    for (const c of data.contents) {
      map.set(
        campaignKey(c),
        (c.items ?? []).map((i) => ({
          name: (i.name ?? '').replace(/\s+/g, ' ').trim(),
          winners: typeof i.winners === 'number' && i.winners >= 0 ? i.winners : null,
          imageUrl: typeof i.image?.url === 'string' && i.image.url.startsWith('https://') ? i.image.url : null,
        })),
      );
    }
    if (offset + data.contents.length >= data.totalCount || data.contents.length === 0) break;
  }
  campaignCache = { at: Date.now(), value: map };
  return map;
}

/** 景品の当選者数。取得できなければ null と理由を返す */
export async function getCampaignItems(
  key: string,
): Promise<{ items: CampaignItems | null; error?: string }> {
  try {
    const items = (await campaigns()).get(key) ?? null;
    return items ? { items } : { items: null, error: 'microCMS にこのキャンペーンが見つかりません' };
  } catch (e) {
    console.error('microCMS fetch failed', (e as Error).message);
    return {
      items: null,
      error: e instanceof MicrocmsNotConfiguredError ? e.message : '当選者数を microCMS から取得できませんでした',
    };
  }
}

/** microCMS にあるキャンペーン (月のキー) と景品の一覧。取得できなければ null と理由を返す */
export async function getAllCampaigns(): Promise<{ campaigns: Map<string, CampaignItems> | null; error?: string }> {
  try {
    return { campaigns: await campaigns() };
  } catch (e) {
    console.error('microCMS fetch failed', (e as Error).message);
    return {
      campaigns: null,
      error: e instanceof MicrocmsNotConfiguredError ? e.message : 'キャンペーンを microCMS から取得できませんでした',
    };
  }
}

/* ── サービス (外部サイトへ誘導するもの) ── */

export type ExternalService = { slug: string; name: string; company: string | null };
type RawService = { id: string; slug?: string; name?: string; company?: string; ctaType?: string[] };
let serviceCache: { at: number; value: ExternalService[] } | null = null;

/**
 * microCMS の services のうち「CTA の種類」が externalSite のもの。
 * slug はサイトの誘導クリックの記録 (outbound_clicks.service_slug) と同じ規則 (slug が無ければ ID)。
 */
export async function getExternalServices(): Promise<{ services: ExternalService[] | null; error?: string }> {
  try {
    if (serviceCache && Date.now() - serviceCache.at < 60_000) return { services: serviceCache.value };
    const cred = await credentials();
    if (!cred) throw new MicrocmsNotConfiguredError('microCMS の API キーが設定されていません');
    const list: ExternalService[] = [];
    for (let offset = 0; ; offset += 100) {
      const url = new URL(`https://${cred.serviceDomain}.microcms.io/api/v1/services`);
      url.searchParams.set('limit', '100');
      url.searchParams.set('offset', String(offset));
      url.searchParams.set('fields', 'id,slug,name,company,ctaType');
      const res = await fetch(url, { headers: { 'X-MICROCMS-API-KEY': cred.apiKey }, cache: 'no-store' });
      if (!res.ok) throw new Error(`microCMS から取得できませんでした（status ${res.status}）`);
      const data = (await res.json()) as { contents: RawService[]; totalCount: number };
      for (const c of data.contents) {
        if (c.ctaType?.[0] !== 'externalSite') continue;
        list.push({ slug: c.slug?.trim() || c.id, name: (c.name ?? '').trim() || c.id, company: c.company ?? null });
      }
      if (offset + data.contents.length >= data.totalCount || data.contents.length === 0) break;
    }
    serviceCache = { at: Date.now(), value: list };
    return { services: list };
  } catch (e) {
    console.error('microCMS fetch failed', (e as Error).message);
    return {
      services: null,
      error: e instanceof MicrocmsNotConfiguredError ? e.message : 'サービスを microCMS から取得できませんでした',
    };
  }
}
