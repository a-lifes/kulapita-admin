/**
 * Excel でそのまま開ける CSV (UTF-8 BOM 付き・CRLF) を作る。
 * 数式として実行されてしまう値 (CSV インジェクション) は、先頭に ' を付けて無害化する。
 * 対象: 先頭が = + - @ | % タブ・改行 で始まる値。次のような抜け道も同じように扱う。
 *   ・全角の ＝ ＋ － ＠ ｜ ％ (日本語の Excel は全角のまま数式として読むことがある)
 *   ・先頭に空白 (半角・全角) を入れてから = などを書いたもの
 * 数値 (件数など) はそのまま出す (マイナスの数を文字にしないため)。
 */
const FORMULA_RE = /^[\s\u3000]*[=+\-@|%＝＋－＠｜％]/;

function cell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (typeof value !== 'number' && (FORMULA_RE.test(s) || /^[\t\r\n]/.test(s))) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  const lines = [header, ...rows].map((r) => r.map(cell).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}

export function csvResponse(filename: string, body: string): Response {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      // 日本語のファイル名は filename* (RFC 5987) で渡す。古いブラウザ向けに ASCII 名も付ける
      'Content-Disposition': `attachment; filename="${filename.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'no-store',
    },
  });
}
