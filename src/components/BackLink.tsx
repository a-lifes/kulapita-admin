import Link from 'next/link';
import { icons } from './icons';

/** 詳細画面のタイトルの左に置く「一覧に戻る」ボタン (＜) */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="-ml-2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-brand"
    >
      <icons.chevronLeft className="h-5 w-5" />
    </Link>
  );
}
