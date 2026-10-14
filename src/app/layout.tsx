import type { Metadata } from 'next';
import './globals.css';

// 環境名 (STAGE) を実行時に読むため、ビルド時に固定しない
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  // 各画面で title を指定すると「kulapita - 画面名」になる
  title: { template: 'kulapita - %s', default: 'kulapita' },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      {/* 環境名 (開発環境・ローカル環境) は各画面のヘッダーに出す */}
      <body>{children}</body>
    </html>
  );
}
