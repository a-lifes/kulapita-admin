import type { Metadata } from 'next';
import { ContactDetail } from './ContactDetail';

export const metadata: Metadata = { title: 'お問い合わせ詳細' };

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ContactDetail id={id} variant="page" />;
}
