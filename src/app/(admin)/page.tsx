import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/guard';
import { query } from '@/lib/db';

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  await requireAdmin();
  const { denied } = await searchParams;
  const [{ rows: c }, { rows: n }, { rows: p }] = await Promise.all([
    query<{ pending: number; in_progress: number; recent: number }>(
      `SELECT
         SUM(status = 'pending') AS pending,
         SUM(status = 'in_progress') AS in_progress,
         SUM(created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY)) AS recent
       FROM contacts WHERE deleted_at IS NULL`,
    ),
    query<{ active: number }>(
      "SELECT COUNT(*) AS active FROM newsletter_subscribers WHERE status = 'active' AND deleted_at IS NULL",
    ),
    query<{ campaign_key: string; total: number }>(
      `SELECT campaign_key, COUNT(*) AS total FROM present_applications
       GROUP BY campaign_key ORDER BY campaign_key DESC LIMIT 1`,
    ),
  ]);

  const cards = [
    { title: '未対応のお問い合わせ', value: Number(c[0]?.pending ?? 0), href: '/contacts?status=pending' },
    { title: '対応中のお問い合わせ', value: Number(c[0]?.in_progress ?? 0), href: '/contacts?status=in_progress' },
    { title: '直近 7 日のお問い合わせ', value: Number(c[0]?.recent ?? 0), href: '/contacts' },
    { title: 'メルマガ登録中', value: Number(n[0]?.active ?? 0), href: '/newsletter?status=active' },
    {
      title: p[0] ? `プレゼント応募 (${p[0].campaign_key})` : 'プレゼント応募',
      value: Number(p[0]?.total ?? 0),
      href: p[0] ? `/presents?campaign=${encodeURIComponent(p[0].campaign_key)}` : '/presents',
    },
  ];

  return (
    <>
      <h1 className="page-title">ダッシュボード</h1>
      {denied && <p className="error mb-4">この画面を見る権限がありません。</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Link key={card.title} href={card.href} className="card hover:border-brand">
            <p className="text-sm text-slate-600">{card.title}</p>
            <p className="mt-2 text-3xl font-bold">{card.value.toLocaleString()}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
