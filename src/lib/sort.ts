/**
 * 一覧の並べ替え (URL の ?sort=列&dir=asc|desc)。
 * 列名は画面ごとに決めた一覧 (columns) にあるものだけ受け付ける (SQL に任意の文字列を入れない)。
 */
export type SortDir = 'asc' | 'desc';
export type SortState = { key: string; dir: SortDir };
export type SortColumn = {
  /** SQL の並べ替え式 (DB で並べる画面だけ) */
  sql?: string;
  /** 初めてその列を押したときの向き (日時は新しい順から) */
  firstDir?: SortDir;
};

export function resolveSort(
  sp: Record<string, string | undefined>,
  columns: Record<string, SortColumn>,
  fallback: SortState,
): SortState {
  const key = sp.sort && Object.hasOwn(columns, sp.sort) ? sp.sort : fallback.key;
  const dir: SortDir =
    sp.dir === 'asc' || sp.dir === 'desc'
      ? sp.dir
      : key === fallback.key
        ? fallback.dir
        : (columns[key]?.firstDir ?? 'asc');
  return { key, dir };
}

/** ORDER BY 句の中身。同じ値の行の順番がぶれないよう、最後に tiebreak で並べる */
export function orderBySql(columns: Record<string, SortColumn>, s: SortState, tiebreak: string): string {
  const sql = columns[s.key]?.sql;
  return `${sql ? `${sql} ${s.dir === 'asc' ? 'ASC' : 'DESC'}, ` : ''}${tiebreak}`;
}

/** 画面側で並べ替えるとき用 (件数が少ない一覧) */
export function sortRows<T>(rows: T[], s: SortState, value: (row: T, key: string) => string | number | null): T[] {
  const sign = s.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = value(a, s.key);
    const vb = value(b, s.key);
    if (va === vb) return 0;
    // 空の値は常に最後
    if (va === null || va === '') return 1;
    if (vb === null || vb === '') return -1;
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sign;
    return String(va).localeCompare(String(vb), 'ja') * sign;
  });
}
