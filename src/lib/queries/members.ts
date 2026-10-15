import 'server-only';
import { likeEscape, Params } from '../db';

/** 都道府県 (会員一覧の絞り込み用) */
export const PREFECTURES = [
  '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県', '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県',
  '東京都', '神奈川県', '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県', '三重県',
  '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県',
  '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県',
];

export type MemberFilter = { prefecture?: string; q?: string };

export function normalizeMemberFilter(sp: Record<string, string | undefined>): MemberFilter {
  return {
    prefecture: sp.prefecture && PREFECTURES.includes(sp.prefecture) ? sp.prefecture : undefined,
    q: sp.q?.trim().slice(0, 100) || undefined,
  };
}

/** 一覧・CSV 共通の絞り込み条件 (テストデータ smoke-… は出さない) */
export function memberWhere(f: MemberFilter): { sql: string; params: Params } {
  const conds = ['u.deleted_at IS NULL', "u.external_id NOT LIKE 'smoke-%'"];
  const params: Params = {};
  if (f.q) {
    conds.push('(u.external_id = :qExact OR u.display_name LIKE :qLike OR u.email LIKE :qLike OR u.phone LIKE :qLike)');
    params.qExact = f.q;
    params.qLike = `%${likeEscape(f.q)}%`;
  }
  if (f.prefecture) {
    conds.push('u.prefecture = :prefecture');
    params.prefecture = f.prefecture;
  }
  return { sql: conds.join(' AND '), params };
}
