/**
 * 会員情報 (users テーブル)。組合HP の登録内容をプレゼント応募のときに受け取って保存している。
 * 画面 (モーダル) と CSV の両方で使う。
 */
export type Member = {
  external_id: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  zipcode: string | null;
  prefecture: string | null;
  city: string | null;
  building: string | null;
  first_authenticated_at: string | null;
  last_login_at: string | null;
  profile_updated_at: string | null;
};

/** users を u として JOIN したときの SELECT 列 (m_ で始まる別名にする) */
export const MEMBER_COLUMNS = `u.external_id AS m_external_id, u.display_name AS m_display_name,
  u.email AS m_email, u.phone AS m_phone, u.zipcode AS m_zipcode, u.prefecture AS m_prefecture,
  u.city AS m_city, u.building AS m_building, u.first_authenticated_at AS m_first_authenticated_at,
  u.last_login_at AS m_last_login_at, u.profile_updated_at AS m_profile_updated_at`;

export function memberFromRow(r: Record<string, unknown>): Member | null {
  if (!r.m_external_id) return null;
  const s = (k: string) => (r[`m_${k}`] as string | null) ?? null;
  return {
    external_id: r.m_external_id as string,
    display_name: s('display_name'),
    email: s('email'),
    phone: s('phone'),
    zipcode: s('zipcode'),
    prefecture: s('prefecture'),
    city: s('city'),
    building: s('building'),
    first_authenticated_at: s('first_authenticated_at'),
    last_login_at: s('last_login_at'),
    profile_updated_at: s('profile_updated_at'),
  };
}

export function memberAddress(m: Member): string {
  const zip = m.zipcode ? `〒${m.zipcode} ` : '';
  const body = `${m.prefecture ?? ''}${m.city ?? ''}${m.building ? ` ${m.building}` : ''}`;
  return body ? `${zip}${body}` : '';
}
