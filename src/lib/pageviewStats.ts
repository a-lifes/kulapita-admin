import 'server-only';
import { addDays, jstStartAsUtc } from './dateRange';
import { query } from './db';
import { loginPopupStats, pageViewsByPath, PopupStat, SiteKey, SITES } from './ga4';

/** ページ別表示回数の 1 行 (GA4 の表示回数 + ログインポップアップの表示回数・人数) */
export type PageStatRow = {
  path: string;
  title: string;
  views: number;
  users: number;
  popupCount: number;
  popupUsers: number;
};

export type PageStats = {
  rows: PageStatRow[];
  /** 期間内のログインポップアップの表示回数・人数 (GA4。取得できなければ null) */
  popup: PopupStat | null;
  /** 期間内にサイトへログインした回数・人数 (自前の DB。人数は同じ会員が何度ログインしても 1 人。取得できなければ null) */
  login: { count: number; users: number } | null;
};

/**
 * 「ページ別表示回数」の画面と CSV で使う数字をまとめて取る。
 * ・表示回数・ユーザー数 … GA4 (取れなければ例外。画面にエラーを出す)
 * ・ログインポップアップの表示回数・人数 … GA4 のイベント。取れなくても表示回数は出す (列は 0 / 合計は「—」)
 * ・ログイン数・ログイン人数 … member_logins (サイトのホスト名で絞る)。ページ別には持っていないので合計だけ
 */
export async function pageStats(site: SiteKey, from: string, to: string): Promise<PageStats> {
  const [views, popups, logins] = await Promise.all([
    pageViewsByPath(site, from, to),
    loginPopupStats(site, from, to).catch((e) => {
      console.error('[ga4] ログインポップアップの回数・人数を取得できませんでした', e instanceof Error ? e.message : e);
      return null;
    }),
    loginStats(site, from, to),
  ]);

  const rows: PageStatRow[] = views.map((r) => {
    const p = popups?.byPath.get(r.path);
    return { ...r, popupCount: p?.count ?? 0, popupUsers: p?.users ?? 0 };
  });
  // ログインが必要なページを直接開いた人は、そのページの表示回数が付かない (すぐ /login-required に移る) ため、
  // ポップアップだけのページも行として足す
  if (popups) {
    const known = new Set(rows.map((r) => r.path));
    for (const [path, p] of popups.byPath) {
      if (!known.has(path)) rows.push({ path, title: '', views: 0, users: 0, popupCount: p.count, popupUsers: p.users });
    }
  }
  return { rows, popup: popups?.total ?? null, login: logins };
}

async function loginStats(site: SiteKey, from: string, to: string): Promise<{ count: number; users: number } | null> {
  const hosts = SITES[site].hosts;
  const hostParams = Object.fromEntries(hosts.map((h, i) => [`host${i}`, h]));
  const hostList = hosts.map((_, i) => `:host${i}`).join(', ');
  try {
    const { rows } = await query<{ count: number; users: number }>(
      `SELECT COUNT(*) AS count, COUNT(DISTINCT user_id) AS users FROM member_logins
       WHERE created_at >= :start AND created_at < :end AND site_host IN (${hostList})`,
      { start: jstStartAsUtc(from), end: jstStartAsUtc(addDays(to, 1)), ...hostParams },
    );
    return { count: Number(rows[0]?.count ?? 0), users: Number(rows[0]?.users ?? 0) };
  } catch (e) {
    console.error('[pageviews] ログイン数を取得できませんでした', e instanceof Error ? e.message : e);
    return null;
  }
}
