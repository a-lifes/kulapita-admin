import { Logo } from '@/components/Logo';

export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-[90vh] items-center justify-center px-4">
      <div className="card w-full max-w-md">
        <div className="mb-5">
          <Logo width={180} />
          <p className="mt-1.5 text-xs font-bold tracking-wider text-slate-500">管理画面</p>
        </div>
        <h1 className="mb-5 text-lg font-bold">{title}</h1>
        {children}
      </div>
    </main>
  );
}
