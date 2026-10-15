'use server';

import { requireAdmin } from '@/lib/auth/guard';
import { likeEscape, query } from '@/lib/db';

/** ⌘K の検索結果 (1 件分) */
export type QuickResult = { kind: string; label: string; sub: string; href: string };

/**
 * ⌘K の検索: 会員 (会員番号・名前・メール)、お問い合わせ・申し込み (受付番号・名前・メール) を探す。
 * それぞれ 5 件まで。
 */
export async function quickSearch(raw: string): Promise<QuickResult[]> {
  await requireAdmin();
  const q = raw.trim().slice(0, 100);
  if (!q) return [];
  const params = { qExact: q, qUpper: q.toUpperCase(), qLike: `%${likeEscape(q)}%` };
  const [members, contacts, applications] = await Promise.all([
    query<{ external_id: string; display_name: string | null; email: string | null }>(
      `SELECT external_id, display_name, email FROM users
       WHERE deleted_at IS NULL AND external_id NOT LIKE 'smoke-%'
         AND (external_id = :qExact OR display_name LIKE :qLike OR email LIKE :qLike)
       ORDER BY last_login_at DESC LIMIT 5`,
      params,
    ),
    query<{ id: string; reception_number: string; name: string; category: string | null }>(
      `SELECT id, reception_number, name, category FROM contacts
       WHERE deleted_at IS NULL AND route <> 'service'
         AND (reception_number = :qUpper OR name LIKE :qLike OR email LIKE :qLike)
       ORDER BY created_at DESC LIMIT 5`,
      params,
    ),
    query<{ id: string; reception_number: string; name: string; service_name: string | null }>(
      `SELECT id, reception_number, name, service_name FROM service_applications
       WHERE deleted_at IS NULL
         AND (reception_number = :qUpper OR name LIKE :qLike OR email LIKE :qLike)
       ORDER BY created_at DESC LIMIT 5`,
      params,
    ),
  ]);
  return [
    ...members.rows.map((m) => ({
      kind: '会員',
      label: m.display_name || m.external_id,
      sub: [m.external_id, m.email].filter(Boolean).join(' ・ '),
      href: `/members?q=${encodeURIComponent(m.external_id)}`,
    })),
    ...contacts.rows.map((c) => ({
      kind: 'お問い合わせ',
      label: `${c.reception_number}　${c.name}`,
      sub: c.category ?? '',
      href: `/contacts/${c.id}`,
    })),
    ...applications.rows.map((a) => ({
      kind: '申し込み',
      label: `${a.reception_number}　${a.name}`,
      sub: a.service_name ?? '',
      href: `/applications/${a.id}`,
    })),
  ];
}
