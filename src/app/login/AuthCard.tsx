export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-[90vh] items-center justify-center px-4">
      <div className="card w-full max-w-md">
        <p className="mb-1 text-xs font-semibold tracking-wider text-brand">kulapita 管理画面</p>
        <h1 className="mb-5 text-lg font-bold">{title}</h1>
        {children}
      </div>
    </main>
  );
}
