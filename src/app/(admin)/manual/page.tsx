import type { Metadata } from 'next';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { requireAdmin } from '@/lib/auth/guard';
import { ManualBody, parseManual } from '@/lib/manualMarkdown';

export const metadata: Metadata = { title: '操作マニュアル' };

/**
 * 操作マニュアル (サイドメニュー上部の本のボタンから別タブで開く)
 * 本文は public/manual/manual.md、画像は public/manual/*.jpg。文章を直すときは manual.md だけ直せばよい。
 */
export default async function ManualPage() {
  await requireAdmin();
  const md = await readFile(path.join(process.cwd(), 'public', 'manual', 'manual.md'), 'utf8');
  const { blocks, toc } = parseManual(md);

  return (
    <div className="flex gap-10">
      <div className="max-w-5xl min-w-0 flex-1">
        <div className="mb-8">
          <h1 className="page-title mb-1">操作マニュアル</h1>
          <p className="text-sm text-slate-500">kulapita 管理画面の使い方。画面例は開発環境のもので、名前・メールアドレスなどはダミーです。</p>
        </div>
        <ManualBody blocks={blocks} />
        <p className="mt-16 border-t border-slate-200 pt-4 text-center text-xs text-slate-400">© 2026 kulapita. All rights reserved.</p>
      </div>

      {/* 目次 (広い画面のみ) */}
      <nav aria-label="目次" className="sticky top-6 hidden max-h-[calc(100vh-3rem)] w-60 shrink-0 self-start overflow-y-auto xl:block">
        <p className="mb-2 text-xs font-bold text-slate-500">目次</p>
        <ul className="space-y-0.5 text-sm">
          {toc.map((t) => (
            <li key={t.id}>
              <a
                href={`#${t.id}`}
                className={`block rounded px-2 py-1 hover:bg-nav-active hover:text-brand ${
                  t.level === 1 ? 'mt-3 font-bold text-slate-900' : 'pl-4 text-slate-600'
                }`}
              >
                {t.text}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
