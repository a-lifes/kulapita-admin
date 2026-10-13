/**
 * Excel でそのまま開ける CSV (UTF-8 BOM 付き・CRLF) を作る。
 * 「= + - @」で始まる値は Excel が数式として実行してしまうため、先頭に ' を付けて無害化する。
 */
function cell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
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
