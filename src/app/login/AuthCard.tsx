import { Logo } from '@/components/Logo';
import { currentStage, STAGE_LABEL } from '@/lib/stage';

export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  const stage = currentStage();
  return (
    <main className="flex min-h-[90vh] items-center justify-center px-4">
      <div className="card w-full max-w-md">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <Logo width={180} />
            <p className="mt-1.5 text-xs font-bold tracking-wider text-slate-500">管理画面</p>
          </div>
          {stage !== 'prod' && (
            <span className={`rounded-full px-3 py-1 text-xs font-bold text-white ${stage === 'dev' ? 'bg-sky-600' : 'bg-amber-500'}`}>
              {STAGE_LABEL[stage]}
            </span>
          )}
        </div>
        <h1 className="mb-5 text-lg font-bold">{title}</h1>
        {children}
      </div>
    </main>
  );
}
