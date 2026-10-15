'use client';

import { openDetail, type OpenDetail } from './DetailDrawerHost';

/**
 * 押すと右側のパネルで詳細を開く一覧の行 (画面は移動しない)。
 * 行の中のボタン・入力欄を押したときはそちらを優先する。
 * 受付番号のリンクも同じくパネルで開く (Ctrl / ⌘ を押しながらだと、別のタブでページを開く)。
 */
export function ClickableRow({ detail, children }: { detail: OpenDetail; children: React.ReactNode }) {
  return (
    <tr
      className="cursor-pointer"
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('button, select, input, label, dialog')) return;
        const link = target.closest('a');
        if (link) {
          if (!link.hasAttribute('data-detail') || e.metaKey || e.ctrlKey || e.shiftKey) return;
          e.preventDefault();
        }
        if (window.getSelection()?.toString()) return; // 文字を選んでコピーしようとしているとき
        openDetail(detail);
      }}
    >
      {children}
    </tr>
  );
}
