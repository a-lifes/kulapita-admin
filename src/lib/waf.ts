import 'server-only';
import { GetIPSetCommand, UpdateIPSetCommand, WAFV2Client } from '@aws-sdk/client-wafv2';

/**
 * DB の許可 IP 一覧を WAF の IP セットに反映する (WAF が ALB の手前で通す/止めるを決める)。
 * WAF の IP セットは「一覧ごと置き換え」なので、毎回 DB の有効な行すべてを送る。
 */
const client = new WAFV2Client({ region: process.env.AWS_REGION ?? 'ap-northeast-1' });

export type WafSyncResult = { ok: true } | { ok: false; error: string };

export function isWafConfigured(): boolean {
  return Boolean(process.env.WAF_IPSET_NAME && process.env.WAF_IPSET_ID);
}

export async function syncWafIpSet(cidrs: string[]): Promise<WafSyncResult> {
  const Name = process.env.WAF_IPSET_NAME;
  const Id = process.env.WAF_IPSET_ID;
  if (!Name || !Id) return { ok: false, error: 'WAF の設定が無いため、WAF には反映していません' };
  if (cidrs.length === 0) return { ok: false, error: '許可 IP が 0 件のため WAF には反映していません' };
  const Scope = 'REGIONAL';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const current = await client.send(new GetIPSetCommand({ Name, Id, Scope }));
      await client.send(
        new UpdateIPSetCommand({
          Name,
          Id,
          Scope,
          Addresses: cidrs,
          LockToken: current.LockToken,
          Description: current.IPSet?.Description,
        }),
      );
      return { ok: true };
    } catch (e) {
      const name = (e as { name?: string }).name ?? 'Error';
      if (name === 'WAFOptimisticLockException' && attempt < 3) continue;
      console.error('WAF sync failed', name);
      return { ok: false, error: `WAF への反映に失敗しました (${name})` };
    }
  }
  return { ok: false, error: 'WAF への反映に失敗しました' };
}
