'use server';

import { CaseKind, loadCaseDetail } from '@/lib/caseDetail';

/** 右側のパネルで出す詳細を読む (一覧の行・⌘K の検索結果から開いたとき) */
export async function loadCaseDetailAction(kind: CaseKind, id: string) {
  if (kind !== 'contact' && kind !== 'application') return null;
  return loadCaseDetail(kind, id);
}
