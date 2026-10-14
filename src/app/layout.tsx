import type { Metadata } from 'next';
import './globals.css';

// 環境名 (STAGE) を実行時に読むため、ビルド時に固定しない
export const dynamic = 'force-dynamic';

const stage = process.env.STAGE ?? 'local';

export const metadata: Metadata = {
  title: stage === 'prod' ? 'kulapita 管理画面' : `[${stage}] kulapita 管理画面`,
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
