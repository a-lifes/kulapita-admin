import 'server-only';
import { addDays, jstStartAsUtc } from './dateRange';
import { query } from './db';
import { loginPopupViewsByPath, pageViewsByPath, SiteKey, SITES } from './ga4';

/** ページ別表示回数の 1 行 (GA4 の表示回数 + ログインポップアップの表示回数) */
export type PageStatRow = { path: string; title: string; views: number; users: number; popups: number };

export type PageStats = {
  rows: PageStatRow[];
  /** 期間内のログインポップアップの表示回数の合計 (GA4。取得できなければ null) */
  popupTotal: number | null;
  /** 期間内にサイトへログインした回数 (自前の DB。取得できなければ null) */
  loginTotal: number | null;
};

/**
 * 「ページ別表示回数」の画面と CSV で使う数字をまとめて取る。
 * ・表示回数・ユーザー数 … GA4 (取れなければ例外。画面にエラーを出す)
 * ・ログインポップアップ … GA4 のイベント。取れなくても表示回数は出す (列は 0 / 合計は「—」)
 * ・ログイン数 … member_logins (サイトのホスト名で絞る)。ページ別には持っていないので合計だけ
 */
export async function pageStats(site: SiteKey, from: string, to: string): Promise<PageStats> {
  const [views, popups, logins] = await Promise.all([
    pageViewsByPath(site, from, to),
    loginPopupViewsByPath(site, from, to).catch((e) => {
      console.error('[ga4] ログインポップアップの回数を取得できませんでした', e instanceof Error ? e.message : e);
      return null;
    }),
    loginCount(site, from, to),
  ]);

  const rows: PageStatRow[] = views.map((r) => ({ ...r, popups: popups?.get(r.path) ?? 0 }));
  // ログインが必要なページを直接開いた人は、そのページの表示回数が付かない (すぐ /login-required に移る) ため、
  // ポップアップだけのページも行として足す
  if (popups) {
    const known = new Set(rows.map((r) => r.path));
    for (const [path, n] of popups) {
      if (!known.has(path)) rows.push({ path, title: '', views: 0, users: 0, popups: n });
    }
  }
  const popupTotal = popups ? [...popups.values()].reduce((a, b) => a + b, 0) : null;
  return { rows, popupTotal, loginTotal: logins };
}

async function loginCount(site: SiteKey, from: string, to: string): Promise<number | null> {
  const hosts = SITES[site].hosts;
  const hostParams = Object.fromEntries(hosts.map((h, i) => [`host${i}`, h]));
  const hostList = hosts.map((_, i) => `:host${i}`).join(', ');
  try {
    const { rows } = await query<{ total: number }>(
      `SELECT COUNT(*) AS total FROM member_logins
       WHERE created_at >= :start AND created_at < :end AND site_host IN (${hostList})`,
      { start: jstStartAsUtc(from), end: jstStartAsUtc(addDays(to, 1)), ...hostParams },
    );
    return Number(rows[0]?.total ?? 0);
  } catch (e) {
    console.error('[pageviews] ログイン数を取得できませんでした', e instanceof Error ? e.message : e);
    return null;
  }
}
