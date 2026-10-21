import {
  BeginTransactionCommand,
  CommitTransactionCommand,
  ExecuteStatementCommand,
  Field,
  RDSDataClient,
  RollbackTransactionCommand,
  SqlParameter,
} from '@aws-sdk/client-rds-data';

/**
 * RDS Data API で SQL を実行する薄いラッパー。
 * 管理画面用 DB ユーザー (kulapita_adm_app: SELECT / INSERT / UPDATE のみ) のシークレットで接続する。
 * 値は必ずパラメーター (:name) で渡し、SQL に文字列を埋め込まない。
 */
const client = new RDSDataClient({ region: process.env.AWS_REGION ?? 'ap-northeast-1' });

function target() {
  const resourceArn = process.env.DB_CLUSTER_ARN;
  const secretArn = process.env.DB_SECRET_ARN;
  if (!resourceArn || !secretArn) throw new Error('DB_CLUSTER_ARN / DB_SECRET_ARN が未設定です');
  return { resourceArn, secretArn, database: 'kulapita' };
}

export type Params = Record<string, string | number | boolean | null | undefined>;

function toSqlParameters(params: Params): SqlParameter[] {
  return Object.entries(params).map(([name, v]) => {
    if (v === null || v === undefined) return { name, value: { isNull: true } };
    if (typeof v === 'number') {
      return Number.isInteger(v)
        ? { name, value: { longValue: v } }
        : { name, value: { doubleValue: v } };
    }
    if (typeof v === 'boolean') return { name, value: { booleanValue: v } };
    return { name, value: { stringValue: v } };
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 結果を { 列名: 値 } の配列で返す。dev の DB が自動停止から再開中なら待って再試行する */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: Params = {},
): Promise<{ rows: T[]; affected: number }> {
  return run<T>(sql, params);
}

async function run<T>(sql: string, params: Params, transactionId?: string): Promise<{ rows: T[]; affected: number }> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await client.send(
        new ExecuteStatementCommand({
          ...target(),
          sql,
          parameters: toSqlParameters(params),
          includeResultMetadata: true,
          transactionId,
        }),
      );
      const cols = (res.columnMetadata ?? []).map((c) => c.label ?? c.name ?? '');
      const rows = (res.records ?? []).map((record) =>
        Object.fromEntries(record.map((f, i) => [cols[i], fieldValue(f)])),
      ) as T[];
      return { rows, affected: res.numberOfRecordsUpdated ?? 0 };
    } catch (e) {
      if ((e as { name?: string }).name === 'DatabaseResumingException' && attempt <= 10) {
        await sleep(3000);
        continue;
      }
      throw e;
    }
  }
}

export type Tx = {
  query: <T = Record<string, unknown>>(sql: string, params?: Params) => Promise<{ rows: T[]; affected: number }>;
};

/**
 * まとめて 1 つのトランザクションで実行する。fn が例外を投げたら全部取り消す (ロールバック)。
 * SELECT ... FOR UPDATE で行をロックしてから数えて更新する、のように「確かめてから更新」を同時操作に強くするために使う。
 */
export async function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const { resourceArn, secretArn, database } = target();
  let transactionId: string | undefined;
  for (let attempt = 1; ; attempt++) {
    try {
      ({ transactionId } = await client.send(new BeginTransactionCommand({ resourceArn, secretArn, database })));
      break;
    } catch (e) {
      if ((e as { name?: string }).name === 'DatabaseResumingException' && attempt <= 10) {
        await sleep(3000);
        continue;
      }
      throw e;
    }
  }
  if (!transactionId) throw new Error('トランザクションを開始できませんでした');
  const id = transactionId;
  try {
    const result = await fn({ query: (sql, params = {}) => run(sql, params, id) });
    await client.send(new CommitTransactionCommand({ resourceArn, secretArn, transactionId: id }));
    return result;
  } catch (e) {
    await client.send(new RollbackTransactionCommand({ resourceArn, secretArn, transactionId: id })).catch(() => undefined);
    throw e;
  }
}

/** 同時に操作されてロックがぶつかった (デッドロック・ロック待ちの時間切れ) */
export function isLockConflictError(e: unknown): boolean {
  const message = (e as { message?: string }).message ?? '';
  return message.includes('Deadlock') || message.includes('Lock wait timeout');
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: Params = {},
): Promise<T | null> {
  return (await query<T>(sql, params)).rows[0] ?? null;
}

function fieldValue(f: Field): unknown {
  if (f.isNull) return null;
  return f.stringValue ?? f.longValue ?? f.doubleValue ?? f.booleanValue ?? null;
}

export function isDuplicateError(e: unknown): boolean {
  return ((e as { message?: string }).message ?? '').includes('Duplicate entry');
}

/** LIKE 検索用に % _ \ をエスケープする */
export function likeEscape(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
