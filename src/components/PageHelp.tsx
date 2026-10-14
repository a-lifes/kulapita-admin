'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { icons } from './icons';

/**
 * 画面ごとの説明 (メニュー上部の「?」アイコンから開く)。
 *
 * 説明がある画面では、ページの中に次のように書く (画面には何も出ない):
 *   <PageHelp title="権限の違い">…説明…</PageHelp>
 * 説明が無い画面では「?」アイコン自体を出さない。
 */
type Help = { title: string; body: React.ReactNode } | null;
const HelpContext = createContext<{ help: Help; setHelp: (h: Help) => void }>({ help: null, setHelp: () => {} });

export function HelpProvider({ children }: { children: React.ReactNode }) {
  const [help, setHelp] = useState<Help>(null);
  return <HelpContext.Provider value={{ help, setHelp }}>{children}</HelpContext.Provider>;
}

/** ページに置くと、その画面を開いている間だけ「?」アイコンが出る */
export function PageHelp({ title, children }: { title: string; children: React.ReactNode }) {
  const { setHelp } = useContext(HelpContext);
  useEffect(() => {
    setHelp({ title, body: children });
    return () => setHelp(null);
  }, [title, children, setHelp]);
  return null;
}

/** メニュー上部の「?」アイコン (押すと画面中央に説明を出す) */
export function HelpButton() {
  const { help } = useContext(HelpContext);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  if (!help) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md p-1.5 text-nav-text hover:bg-nav-active hover:text-brand"
        aria-label={`この画面の説明: ${help.title}`}
        title="この画面の説明"
      >
        <icons.help className="h-5 w-5" />
      </button>
      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === ref.current) setOpen(false);
        }}
        className="m-auto w-[min(560px,92vw)] rounded-xl p-0 text-left font-normal whitespace-normal break-words shadow-2xl backdrop:bg-slate-900/50"
      >
        {open && (
          <div className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <icons.help className="h-5 w-5 text-brand" />
              <h2 className="text-base font-bold text-slate-900">{help.title}</h2>
            </div>
            <div className="text-sm leading-relaxed text-slate-700">{help.body}</div>
            <div className="mt-6 text-right">
              <button type="button" className="btn-sub" onClick={() => setOpen(false)}>閉じる</button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
