'use server';

import { revalidatePath } from 'next/cache';
import { clearAllowedIpCache, getActiveCidrs } from '@/lib/allowedIps';
import { writeAudit } from '@/lib/audit';
import { requireAdmin } from '@/lib/auth/guard';
import { cidrContains, parseCidr } from '@/lib/cidr';
import { isDuplicateError, query, queryOne } from '@/lib/db';
import { requestMeta } from '@/lib/request';
import { uuidv7, UUID_RE } from '@/lib/uuid';
import { syncWafIpSet } from '@/lib/waf';

export type IpActionState = { error?: string; message?: string; warning?: string } | undefined;

/** DB の内容で WAF を上書きし、結果を画面用の文言にする */
async function syncAndReport(message: string): Promise<IpActionState> {
  clearAllowedIpCache();
  const cidrs = await getActiveCidrs({ fresh: true });
  const result = await syncWafIpSet(cidrs);
  revalidatePath('/allowed-ips');
  return result.ok
    ? { message: `${message} WAF にも反映しました（反映まで 1 分ほどかかることがあります）。` }
    : { message, warning: `${result.error}。「WAF に再反映」を押してください。` };
}

export async function addIpAction(_prev: IpActionState, formData: FormData): Promise<IpActionState> {
  const admin = await requireAdmin('super_admin');
  const parsed = parseCidr(String(formData.get('cidr') ?? ''));
  if (!parsed.ok) return { error: parsed.error };
  const labelText = String(formData.get('label') ?? '').trim().slice(0, 100) || null;
  const id = uuidv7();
  try {
    await query(
      'INSERT INTO admin_allowed_ips (id, cidr, label, created_by) VALUES (:id, :cidr, :label, :by)',
      { id, cidr: parsed.value.cidr, label: labelText, by: admin.id },
    );
  } catch (e) {
    if (isDuplicateError(e)) return { error: `${parsed.value.cidr} は登録済みです` };
    throw e;
  }
  await writeAudit({
    admin,
    action: 'allowed_ip.create',
    targetType: 'allowed_ip',
    targetId: id,
    diff: { cidr: parsed.value.cidr, label: labelText },
  });
  return syncAndReport(`${parsed.value.cidr} を追加しました。`);
}

export async function deleteIpAction(id: string): Promise<IpActionState> {
  const admin = await requireAdmin('super_admin');
  if (!UUID_RE.test(id)) return { error: '対象が見つかりません' };
  const target = await queryOne<{ cidr: string; label: string | null }>(
    'SELECT cidr, label FROM admin_allowed_ips WHERE id = :id AND deleted_at IS NULL',
    { id },
  );
  if (!target) return { error: '対象が見つかりません' };

  const cidrs = await getActiveCidrs({ fresh: true });
  const remaining = cidrs.filter((c) => c !== target.cidr);
  if (remaining.length === 0) return { error: '最後の 1 件は削除できません（誰も管理画面に入れなくなるため）' };
  // 自分が締め出されないよう、今つないでいる IP が残りの一覧で許可されることを確かめる
  const { ip } = await requestMeta();
  if (ip && !remaining.some((c) => cidrContains(c, ip))) {
    return { error: `今お使いの IP（${ip}）が許可されなくなるため削除できません。先に別の範囲を追加してください` };
  }

  await query('UPDATE admin_allowed_ips SET deleted_at = UTC_TIMESTAMP() WHERE id = :id AND deleted_at IS NULL', { id });
  await writeAudit({
    admin,
    action: 'allowed_ip.delete',
    targetType: 'allowed_ip',
    targetId: id,
    diff: { cidr: target.cidr, label: target.label },
  });
  return syncAndReport(`${target.cidr} を削除しました。`);
}

export async function resyncWafAction(): Promise<IpActionState> {
  const admin = await requireAdmin('super_admin');
  await writeAudit({ admin, action: 'allowed_ip.sync' });
  return syncAndReport('DB の一覧を WAF に送りました。');
}
