import { Drawer } from '@/components/Drawer';

/**
 * 右側のパネルの枠。読み込み中 (loading.tsx) と中身 (page.tsx) で同じ枠を使い続けるので、
 * スライドして出る動きは 1 回だけになる。
 */
export default function DrawerLayout({ children }: { children: React.ReactNode }) {
  return <Drawer label="申し込みの詳細">{children}</Drawer>;
}
