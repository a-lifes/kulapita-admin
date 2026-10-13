import Image from 'next/image';

/** kulapita のロゴ (public/logo.png・640×119) */
export function Logo({ width = 160 }: { width?: number }) {
  return (
    <Image
      src="/logo.png"
      alt="kulapita"
      width={width}
      height={Math.round((width * 119) / 640)}
      priority
      // 小さい画像なので最適化 (画像変換) はせずそのまま配信する
      unoptimized
    />
  );
}
