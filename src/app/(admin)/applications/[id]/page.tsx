import type { Metadata } from 'next';
import { ApplicationDetail } from './ApplicationDetail';

export const metadata: Metadata = { title: '申し込みの詳細' };

export default async function ApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ApplicationDetail id={id} variant="page" />;
}
