'use client';

import { useRouter } from 'next/navigation';

/**
 * 押すと詳細を開く一覧の行。行の中のリンク・ボタン・入力欄を押したときはそちらを優先する。
 * (一覧から開くと、右側のパネルで詳細が出る)
 */
export function ClickableRow({ href, children }: { href: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <tr
      className="cursor-pointer"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('a, button, select, input, label, dialog')) return;
        if (window.getSelection()?.toString()) return; // 文字を選んでコピーしようとしているとき
        router.push(href, { scroll: false });
      }}
    >
      {children}
    </tr>
  );
}
