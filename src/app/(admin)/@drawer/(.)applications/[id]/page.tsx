import { Drawer } from '@/components/Drawer';
import { ApplicationDetail } from '../../../applications/[id]/ApplicationDetail';

/** 一覧から開いたときは、画面を移動せず右側のパネルで詳細を出す (直接開いたときは通常のページ) */
export default async function ApplicationDetailDrawer({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Drawer label="申し込みの詳細">
      <ApplicationDetail id={id} variant="drawer" />
    </Drawer>
  );
}
