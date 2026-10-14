import { Logo } from '@/components/Logo';
import { currentStage, STAGE_LABEL } from '@/lib/stage';

/**
 * ログイン・パスワード設定画面の枠。
 * 背景はサイトのキービジュアル (kulapita/public/hero-parallax の各レイヤーを 1 枚に重ねた画像)。
 */
export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  const stage = currentStage();
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[#fef1dc] bg-[url('/login-bg.webp')] bg-cover bg-center px-4 py-10">
      {/* 背景の絵が少し透けるよう、白は少し透過させる */}
      <div className="w-full max-w-lg rounded-xl bg-white/85 p-8 shadow-xl ring-1 ring-black/5 backdrop-blur-sm">
        <div className="mb-5 flex items-start justify-between gap-3">
          <Logo width={180} />
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
