import {
  ExecuteStatementCommand,
  Field,
  RDSDataClient,
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
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await client.send(
        new ExecuteStatementCommand({
          ...target(),
          sql,
          parameters: toSqlParameters(params),
          includeResultMetadata: true,
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
