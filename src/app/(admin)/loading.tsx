/**
 * 画面を移動している間の表示 (スケルトン)。見出し・絞り込み・一覧の形をした薄い帯を出す。
 */
export default function Loading() {
  const widths = ['w-24', 'w-20', 'w-16', 'w-48', 'w-16', 'w-32', 'w-32'];
  return (
    <div className="list-page" role="status" aria-live="polite">
      <span className="sr-only">読み込んでいます</span>
      <div className="mb-5 flex min-h-10 items-center">
        <span className="skeleton-bar block h-5 w-32" />
      </div>
      <div className="card mb-4 flex items-end gap-3">
        <span className="skeleton-bar block h-9 w-40" />
        <span className="skeleton-bar block h-9 flex-1" />
        <span className="skeleton-bar block h-9 w-24" />
      </div>
      <div className="card table-scroll">
        <table className="table">
          <thead>
            <tr>
              {widths.map((w, i) => (
                <th key={i}>
                  <span className={`skeleton-bar block h-2.5 ${w === 'w-48' ? 'w-24' : 'w-12'}`} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 8 }, (_, r) => (
              <tr key={r}>
                {widths.map((w, i) => (
                  <td key={i}>
                    <span className={`skeleton-bar block h-2.5 ${w}`} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
