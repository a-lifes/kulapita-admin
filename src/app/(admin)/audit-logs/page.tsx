import type { Metadata } from 'next';
import Link from 'next/link';
import { Pagination, pageFrom, perPageFrom } from '@/components/Pagination';
import { requireAdmin } from '@/lib/auth/guard';
import { likeEscape, Params, query } from '@/lib/db';
import { formatJst } from '@/lib/format';
import { AuditDetailLink } from './AuditDetail';
import { ClearButton, SearchButton, SearchForm } from '@/components/SearchForm';
import { SortableTh } from '@/components/SortableTh';
import { orderBySql, resolveSort, SortColumn } from '@/lib/sort';

export const metadata: Metadata = { title: '操作ログ' };

/** 並べ替えできる列 */
const SORT_COLUMNS: Record<string, SortColumn> = {
  created: { sql: 'l.created_at', firstDir: 'desc' },
  account: { sql: 'COALESCE(a.display_name, l.admin_email_snapshot)' },
  action: { sql: 'l.action' },
  target: { sql: 'l.target_type' },
  ip: { sql: 'INET_ATON(l.ip_address)' },
};

const ACTION_LABEL: Record<string, string> = {
  'auth.login': 'ログイン',
  'auth.login_failed': 'ログイン失敗',
  'auth.logout': 'ログアウト',
  'auth.password_change': 'パスワード変更',
  'auth.mfa_setup': '2 段階認証の登録',
  'contact.update': 'お問い合わせ更新',
  'application.update': '申し込みの更新',
  'export.contacts': 'CSV 出力（お問い合わせ）',
  'export.applications': 'CSV 出力（申し込み）',
  'export.clicks': 'CSV 出力（誘導）',
  'export.newsletter': 'CSV 出力（メルマガ）',
  'export.presents': 'CSV 出力（プレゼント）',
  'present.update_status': 'プレゼント結果の設定',
  'present.bulk_update_status': 'プレゼント結果の一括設定',
  'admin_user.create': 'アカウントの追加',
  'admin_user.update': 'アカウントの変更',
  'admin_user.reset_password': '仮パスワード再発行',
  'admin_user.delete': 'アカウントの削除',
  'admin_user.reset_mfa': '2 段階認証リセット',
  'allowed_ip.create': '許可 IP の追加',
  'allowed_ip.update': '許可 IP の変更',
  'allowed_ip.delete': '許可 IP の削除',
  'allowed_ip.sync': '許可 IP の WAF 再反映',
};

const TARGET_LABEL: Record<string, string> = {
  contact: 'お問い合わせ',
  service_application: '申し込み',
  admin_user: 'アカウント',
  allowed_ip: '許可 IP',
  present_application: 'プレゼント応募',
};

/* 日付 (日本時間の YYYY-MM-DD) */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const toYmd = (d: Date) => d.toISOString().slice(0, 10);
const todayJst = () => toYmd(new Date(Date.now() + 9 * 3600_000));
const shiftDay = (ymd: string, days: number) => toYmd(new Date(Date.parse(`${ymd}T00:00:00Z`) + days * 86_400_000));
/** 日本時間のその日の 0:00 を、DB に入っている UTC の日時文字列にする */
const jstStartAsUtc = (ymd: string) =>
  new Date(Date.parse(`${ymd}T00:00:00Z`) - 9 * 3600_000).toISOString().slice(0, 19).replace('T', ' ');

type Row = {
  id: string;
  account_name: string | null;
  admin_email_snapshot: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  diff: string | null;
  ip_address: string | null;
  user_agent: string | null;
  account_email: string | null;
  created_at: string;
};

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAdmin('admin');
  const sp = await searchParams;
  const action = sp.action && ACTION_LABEL[sp.action] ? sp.action : undefined;
  const q = sp.q?.trim().slice(0, 100) || undefined;
  const page = pageFrom(sp.page);

  const perPage = perPageFrom(sp.per);
  // 件数が多くなるため 1 日ずつ表示する (初期値は今日)
  const today = todayJst();
  const date = sp.date && DATE_RE.test(sp.date) && !Number.isNaN(Date.parse(sp.date)) ? sp.date : today;
  const sort = resolveSort(sp, SORT_COLUMNS, { key: 'created', dir: 'desc' });
  const listParams = { date, q, action, per: sp.per };

  const conds: string[] = ['l.created_at >= :start', 'l.created_at < :end'];
  const params: Params = { start: jstStartAsUtc(date), end: jstStartAsUtc(shiftDay(date, 1)) };
  if (action) {
    conds.push('l.action = :action');
    params.action = action;
  }
  if (q) {
    // 操作アカウントの名前・メールアドレス (ログイン失敗など、アカウントが無いものは入力されたメールアドレス)
    conds.push('(a.display_name LIKE :q OR a.email LIKE :q OR l.admin_email_snapshot LIKE :q)');
    params.q = `%${likeEscape(q)}%`;
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const from = 'FROM admin_audit_logs l LEFT JOIN admin_users a ON a.id = l.admin_user_id';

  const [{ rows }, { rows: count }] = await Promise.all([
    query<Row>(
      `SELECT l.id, a.display_name AS account_name, a.email AS account_email, l.admin_email_snapshot, l.action,
              l.target_type, l.target_id, l.diff, l.ip_address, l.user_agent, l.created_at
       ${from} ${where} ORDER BY ${orderBySql(SORT_COLUMNS, sort, 'l.id DESC')} LIMIT :limit OFFSET :offset`,
      { ...params, limit: perPage, offset: (page - 1) * perPage },
    ),
    query<{ total: number }>(`SELECT COUNT(*) AS total ${from} ${where}`, params),
  ]);

  return (
    <div className="list-page">
      <h1 className="page-title">操作ログ</h1>
      <SearchForm className="card mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="date">日付</label>
          <input className="input w-44" type="date" id="date" name="date" defaultValue={date} max={today} required />
        </div>
        <div className="min-w-48 flex-1">
          <label className="label" htmlFor="q">操作アカウント</label>
          <input className="input" id="q" name="q" defaultValue={q ?? ''} placeholder="アカウント名またはメールアドレスの一部を入力" />
        </div>
        <div>
          <label className="label" htmlFor="action">操作</label>
          <select className="input" id="action" name="action" defaultValue={action ?? ''}>
            <option value="">すべて</option>
            {Object.entries(ACTION_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <SearchButton />
        <ClearButton href="/audit-logs" />
      </SearchForm>
      {/* 横スクロールさせない: 内容以外の列は全文を出し、内容の列だけ残りの幅で省略する (全文は日時から開く) */}
      <div className="card table-scroll">
        <table className="table">
          <thead>
            <tr>
              <SortableTh label="日時" sortKey="created" sort={sort} columns={SORT_COLUMNS} basePath="/audit-logs" params={listParams} />
              <SortableTh label="操作アカウント" sortKey="account" sort={sort} columns={SORT_COLUMNS} basePath="/audit-logs" params={listParams} />
              <SortableTh label="操作" sortKey="action" sort={sort} columns={SORT_COLUMNS} basePath="/audit-logs" params={listParams} />
              <SortableTh label="対象" sortKey="target" sort={sort} columns={SORT_COLUMNS} basePath="/audit-logs" params={listParams} />
              <th className="w-full">内容</th>
              <SortableTh label="IP" sortKey="ip" sort={sort} columns={SORT_COLUMNS} basePath="/audit-logs" params={listParams} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const target = r.target_type ? (TARGET_LABEL[r.target_type] ?? r.target_type) : '—';
              const targetHref = !r.target_id
                ? null
                : r.target_type === 'contact'
                  ? `/contacts/${r.target_id}`
                  : r.target_type === 'service_application'
                    ? `/applications/${r.target_id}`
                    : null;
              return (
                <tr key={r.id}>
                  <td>
                    <AuditDetailLink
                      data={{
                        createdAt: formatJst(r.created_at),
                        accountName: r.account_name,
                        email: r.account_email ?? r.admin_email_snapshot,
                        action: ACTION_LABEL[r.action] ?? r.action,
                        target,
                        targetHref,
                        diff: r.diff,
                        ip: r.ip_address,
                        userAgent: r.user_agent,
                      }}
                    />
                  </td>
                  {/* アカウントが無い操作 (存在しないアドレスでのログイン失敗など) は、入力されたメールアドレスを出す */}
                  <td>{r.account_name ?? r.admin_email_snapshot ?? '—'}</td>
                  <td>{ACTION_LABEL[r.action] ?? r.action}</td>
                  <td>
                    {targetHref ? (
                      <Link className="text-brand underline" href={targetHref}>{target}</Link>
                    ) : (
                      target
                    )}
                  </td>
                  <td className="max-w-0">
                    <div className="truncate text-slate-600">{r.diff ?? ''}</div>
                  </td>
                  <td>{r.ip_address ?? ''}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="py-8 text-center text-slate-500">{q || action ? '検索内容に一致するデータはありません。' : 'この日の操作ログはありません。'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination basePath="/audit-logs" params={{ ...listParams, sort: sort.key, dir: sort.dir }} page={page} perPage={perPage} total={Number(count[0]?.total ?? 0)} />
    </div>
  );
}
