import type { NextConfig } from 'next';

/**
 * CSP (読み込んでよい場所の制限)。外部のスクリプトなどを読み込ませる攻撃 (XSS) の被害を小さくする。
 * 管理画面は外部のスクリプトを使わない。画像は景品の画像 (microCMS) だけ外部から読む。
 * ※ Next.js が画面に埋め込むスクリプト・スタイルのため 'unsafe-inline' は許可している
 *   (nonce 方式にすると全画面が毎回サーバーで作られる形になるため、今は見送り)
 * ※ 開発 (npm run dev) では、Next.js の開発機能のため 'unsafe-eval' も許可する
 */
const isDev = process.env.NODE_ENV !== 'production';
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://images.microcms-assets.io",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  // Docker イメージを小さくするため、動かすのに必要なファイルだけを .next/standalone にまとめる
  output: 'standalone',
  poweredByHeader: false,
  // 開発中に出る Next.js のマーク (左下) がユーザーメニューと重なるため右下へ
  devIndicators: { position: 'bottom-right' },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
