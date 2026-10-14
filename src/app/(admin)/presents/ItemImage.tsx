'use client';

import { useEffect, useRef, useState } from 'react';

/** 景品のサムネイル。押すとモーダルで大きく表示する (枠の外・閉じる・Esc で閉じる) */
export function ItemImage({ url, name }: { url: string; name: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="shrink-0 cursor-zoom-in rounded focus-visible:ring-2 focus-visible:ring-brand"
        onClick={() => setOpen(true)}
        aria-label={`${name}の画像を拡大する`}
        title="画像を拡大する"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${url}?w=96&h=96&fit=crop`}
          alt=""
          width={48}
          height={48}
          loading="lazy"
          className="h-12 w-12 rounded object-cover"
        />
      </button>
      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === ref.current) setOpen(false);
        }}
        className="m-auto max-w-[92vw] rounded-lg p-0 backdrop:bg-black/60"
      >
        {open && (
          <div className="p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${url}?w=1200&fit=max`}
              alt={name}
              className="block max-h-[78vh] max-w-full rounded object-contain"
            />
            <div className="mt-3 flex items-center justify-between gap-4">
              <p className="whitespace-normal break-words">{name}</p>
              <button type="button" className="btn-sub shrink-0" onClick={() => setOpen(false)}>
                閉じる
              </button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
