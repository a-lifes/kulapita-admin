/**
 * 右側のパネルを開いた直後 (詳細を読み込んでいる間) は、パネルの形でスケルトンを出す。
 * (これが無いと、管理画面全体の読み込み表示が一瞬出てしまう)
 */
export default function Loading() {
  return (
    <div role="status" aria-live="polite">
        <span className="sr-only">読み込んでいます</span>
        <div className="mb-5 flex items-center gap-3 pr-10">
          <span className="skeleton-bar block h-5 w-36" />
          <span className="skeleton-bar block h-4 w-16" />
        </div>
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
