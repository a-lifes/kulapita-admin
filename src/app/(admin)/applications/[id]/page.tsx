import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BackLink } from '@/components/BackLink';
import { CaseDetailView } from '@/components/CaseDetailView';
import { StatusBadge } from '@/components/StatusBadge';
import { loadCaseDetail } from '@/lib/caseDetail';

export const metadata: Metadata = { title: '申し込みの詳細' };

/** 詳細ページ (直接開いたとき)。一覧から開いたときは右側のパネル (DetailDrawerHost) で同じ中身を出す */
export default async function DetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadCaseDetail('application', id);
  if (!data) notFound();
  return (
    <>
      <h1 className="page-title gap-2">
        <BackLink href="/applications" label="コンバージョン（申し込み）一覧に戻る" />
        <span className="mr-1">申し込みの詳細</span>
        <StatusBadge value={data.status} text={data.statusText} />
      </h1>
      <CaseDetailView data={data} layout="page" />
    </>
  );
}
