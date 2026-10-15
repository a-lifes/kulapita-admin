import { ContactDetail } from '../../../contacts/[id]/ContactDetail';

/** 一覧から開いたときは、画面を移動せず右側のパネルで詳細を出す (直接開いたときは通常のページ) */
export default async function ContactDetailDrawer({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ContactDetail id={id} variant="drawer" />;
}
