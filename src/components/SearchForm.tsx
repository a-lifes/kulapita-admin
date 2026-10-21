'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { createContext, Fragment, useContext, useEffect, useRef, useState, useTransition } from 'react';
import { CollapseHeader, useCollapsed } from './Collapsible';
import { icons } from './icons';

/**
 * 絞り込みエリアのフォーム。「絞込み」ボタンや Enter キーで検索している間、
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
const SearchContext = createContext<{ pending: boolean; navigate: (url: string) => void; clear: (url: string) => void }>({
  pending: false,
  navigate: () => {},
  clear: () => {},
});

/** 絞り込み・表示が終わったときに window に送るイベント名 */
export const SEARCH_DONE_EVENT = 'kadm:search-done';

export function SearchForm({
  className,
  collapsible = false,
  children,
}: {
  className?: string;
  /** 「絞り込み」の見出しを付けて、開閉できるようにする (閉じた状態は画面ごとに覚える) */
  collapsible?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useCollapsed(`search:${pathname}`);
  const [pending, startTransition] = useTransition();
  const navigate = (url: string) => startTransition(() => router.push(url, { scroll: false }));

  /*
   * 入力欄は「今の検索条件」を初期値に表示している。条件が変わったとき (検索・クリアの後) や、
   * 「クリア」を押したとき (検索していなくても入力途中の値を消す) は入力欄を作り直し、初期の状態に戻す。
   */
  const searchParams = useSearchParams();
  const [clearCount, setClearCount] = useState(0);
  const clear = (url: string) => {
    setClearCount((n) => n + 1);
    navigate(url);
  };

  // 検索が終わったら知らせる (同じ条件で検索し直したときに、グラフのアニメーションをやり直すため)
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending) window.dispatchEvent(new Event(SEARCH_DONE_EVENT));
    wasPending.current = pending;
  }, [pending]);

  const form = (
      <form
        id={collapsible ? 'search-area' : undefined}
        className={
          collapsible
            ? `${(className ?? '').replace(/\b(card|mb-4)\b/g, '').trim()} mt-3 ${collapsed ? 'hidden' : ''}`
            : className
        }
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
        <Fragment key={`${searchParams.toString()}#${clearCount}`}>{children}</Fragment>
      </form>
  );

  return (
    <SearchContext.Provider value={{ pending, navigate, clear }}>
      {collapsible ? (
        <div className="card mb-4">
          <CollapseHeader
            title="絞込み"
            collapsed={collapsed}
            onToggle={() => setCollapsed(!collapsed)}
            controls="search-area"
          />
          {form}
        </div>
      ) : (
        form
      )}
      {pending && <LoadingOverlay />}
    </SearchContext.Provider>
  );
}

/** SearchForm の中で、検索と同じようにローディングを出しながら画面を切り替える (期間のボタンなど) */
export function useSearchNavigate() {
  return useContext(SearchContext);
}

/** 「絞込み」ボタン (検索中は「検索中…」とくるくる回るマーク) */
export function SearchButton({
  label = '絞込み',
  icon = 'filter',
}: {
  label?: string;
  /** 文字の左に出すアイコン (icons の名前) */
  icon?: 'filter' | 'eye';
}) {
  const Icon = icons[icon];
  const { pending } = useContext(SearchContext);
  return (
    <button className="btn min-w-20 px-3" disabled={pending}>
      {pending ? (
        <>
          <Spinner className="h-4 w-4" />
          検索中…
        </>
      ) : (
        <>
          <Icon className="h-4 w-4" />
          {label}
        </>
      )}
    </button>
  );
}

/** 「クリア」ボタン (入力欄を初期の状態に戻し、条件を外して読み直す。読み込み中はローディングを出す) */
export function ClearButton({ href }: { href: string }) {
  const { pending, clear } = useContext(SearchContext);
  return (
    <button type="button" className="btn-sub min-w-20 px-3" disabled={pending} onClick={() => clear(href)}>
      <icons.close className="h-4 w-4" />
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

/**
 * 検索中は、一覧をスケルトン (globals.css の form[aria-busy] の指定) に切り替える。
 * ここでは透明な層で画面を覆い、検索中に二重に押せないようにするだけ。
 */
function LoadingOverlay() {
  return (
    <div className="fixed inset-0 z-40 cursor-progress" role="status" aria-live="polite">
      <span className="sr-only">検索しています</span>
    </div>
  );
}
