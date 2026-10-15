'use client';

import { useCallback, useEffect, useState } from 'react';
import { loadCaseDetailAction } from '@/app/(admin)/detailActions';
import type { CaseDetailData, CaseKind } from '@/lib/caseDetail';
import { CaseDetailView } from './CaseDetailView';
import { Drawer } from './Drawer';
import { StatusBadge } from './StatusBadge';

/** 一覧の行・⌘K の検索結果から詳細を開くときに window に送るイベント */
export const OPEN_DETAIL_EVENT = 'kadm:open-detail';
export type OpenDetail = { kind: CaseKind; id: string };

export function openDetail(detail: OpenDetail) {
  window.dispatchEvent(new CustomEvent<OpenDetail>(OPEN_DETAIL_EVENT, { detail }));
}

const PATH: Record<CaseKind, string> = { contact: '/contacts', application: '/applications' };
const TITLE: Record<CaseKind, string> = { contact: 'お問い合わせ詳細', application: '申し込みの詳細' };

/**
 * 右側のパネルで詳細を出す (画面は移動しない)。管理画面に 1 つだけ置く。
 * 開いたらすぐパネルを出し、読み込み中はスケルトン、読み終わったら中身に切り替える。
 */
export function DetailDrawerHost() {
  const [target, setTarget] = useState<OpenDetail | null>(null);
  const [data, setData] = useState<CaseDetailData | null | undefined>(undefined);

  const load = useCallback(async (t: OpenDetail) => {
    const d = await loadCaseDetailAction(t.kind, t.id).catch(() => null);
    setData(d);
  }, []);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const t = (e as CustomEvent<OpenDetail>).detail;
      setTarget(t);
      setData(undefined);
      void load(t);
    };
    window.addEventListener(OPEN_DETAIL_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_DETAIL_EVENT, onOpen);
  }, [load]);

  const close = useCallback(() => setTarget(null), []);
  if (!target) return null;

  return (
    <Drawer label={TITLE[target.kind]} onClose={close}>
      <div className="mb-5 flex items-center gap-3 pr-10">
        <h2 className="text-lg font-bold">{TITLE[target.kind]}</h2>
        {data && <StatusBadge value={data.status} text={data.statusText} />}
        <a href={`${PATH[target.kind]}/${target.id}`} className="ml-auto text-xs text-slate-500 hover:text-brand hover:underline">
          ページで開く
        </a>
      </div>
      {data === undefined ? (
        <DetailSkeleton />
      ) : data === null ? (
        <p className="error">詳細を読み込めませんでした。削除されたか、権限がない可能性があります。</p>
      ) : (
        <CaseDetailView key={data.id} data={data} layout="drawer" onSaved={() => void load(target)} />
      )}
    </Drawer>
  );
}

function DetailSkeleton() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">読み込んでいます</span>
      <div className="card mb-4 grid grid-cols-[9rem_1fr] gap-x-4 gap-y-4">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="contents">
            <span className="skeleton-bar block h-3 w-20" />
            <span className={`skeleton-bar block h-3 ${i % 3 === 0 ? 'w-3/4' : 'w-1/2'}`} />
          </div>
        ))}
      </div>
      <div className="card grid gap-3">
        <span className="skeleton-bar block h-3 w-16" />
        <span className="skeleton-bar block h-9 w-full" />
        <span className="skeleton-bar block h-9 w-full" />
        <span className="skeleton-bar block h-24 w-full" />
      </div>
    </div>
  );
}
