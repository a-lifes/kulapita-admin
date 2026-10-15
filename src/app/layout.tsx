import type { Metadata } from 'next';
// 書体: Noto Sans JP (npm のパッケージに入っているフォントをこのアプリから配信する。外部への通信なし。
// 文字の範囲ごとに分かれていて、画面で使う文字の分だけ読み込まれる)
import '@fontsource-variable/noto-sans-jp';
// 英数字は Inter (数字・日時・会員番号などをシャープに見せる。日本語は Noto Sans JP で表示される)
import '@fontsource-variable/inter';
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
