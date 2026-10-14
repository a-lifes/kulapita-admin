'use client';

import { useEffect, useState } from 'react';

/**
 * 数値を 0 から表示する値までカウントアップして見せる (表示した瞬間から約 0.8 秒)。
 * 動きを減らす設定 (prefers-reduced-motion) の人には最初から最終の値を出す。
 */
export function CountUp({ value, duration = 800 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    // 動きを減らす設定のときは、最初のコマで最終の値にする
    const total = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : duration;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = total === 0 ? 1 : Math.min(1, (now - start) / total);
      const eased = 1 - (1 - t) ** 3; // だんだんゆっくり止まる
      setShown(Math.round(value * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return <span aria-label={value.toLocaleString()}>{shown.toLocaleString()}</span>;
}
