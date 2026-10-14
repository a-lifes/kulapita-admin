'use client';

import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useTransition } from 'react';

/**
 * 絞り込みエリアのフォーム。「絞り込む」ボタンや Enter キーで検索している間、
 * 画面にローディングを出して、検索が動いていることが分かるようにする。
 *
 *   <SearchForm className="card …">
 *     …入力欄…
 *     <SearchButton />
 *     <ClearButton />
 *   </SearchForm>
 *
 * 入力内容は URL の ?q=… に入れて画面を読み直す (空の項目は付けない)。
 */
const SearchContext = createContext<{ pending: boolean; navigate: (url: string) => void }>({
  pending: false,
  navigate: () => {},
});

export function SearchForm({ className, children }: { className?: string; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const navigate = (url: string) => startTransition(() => router.push(url, { scroll: false }));

  return (
    <SearchContext.Provider value={{ pending, navigate }}>
      <form
        className={className}
        aria-busy={pending}
        onSubmit={(e) => {
          e.preventDefault();
          const params = new URLSearchParams();
          for (const [key, value] of new FormData(e.currentTarget)) {
            if (typeof value === 'string' && value.trim() !== '') params.set(key, value.trim());
          }
          const qs = params.toString();
          navigate(qs ? `${pathname}?${qs}` : pathname);
        }}
      >
        {children}
      </form>
      {pending && <LoadingOverlay />}
    </SearchContext.Provider>
  );
}

/** 「絞り込む」ボタン (検索中は「検索中…」とくるくる回るマーク) */
export function SearchButton({ label = '絞り込む' }: { label?: string }) {
  const { pending } = useContext(SearchContext);
  return (
    <button className="btn min-w-24" disabled={pending}>
      {pending ? (
        <>
          <Spinner className="h-4 w-4" />
          検索中…
        </>
      ) : (
        label
      )}
    </button>
  );
}

/** 「クリア」ボタン (条件を外して読み直す。読み込み中はローディングを出す) */
export function ClearButton({ href }: { href: string }) {
  const { pending, navigate } = useContext(SearchContext);
  return (
    <button type="button" className="btn-sub" disabled={pending} onClick={() => navigate(href)}>
      クリア
    </button>
  );
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className ?? ''}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** 検索中は画面を薄く覆い、中央にくるくる回るマークを出す (二重に押せないようにもなる) */
function LoadingOverlay() {
  return (
    <div className="fixed inset-0 z-40 flex cursor-wait items-center justify-center bg-white/50" role="status" aria-live="polite">
      <div className="flex items-center gap-3 rounded-lg bg-white px-5 py-3 text-brand shadow-lg ring-1 ring-slate-200">
        <Spinner className="h-6 w-6" />
        <span className="font-semibold text-slate-700">検索しています…</span>
      </div>
    </div>
  );
}
