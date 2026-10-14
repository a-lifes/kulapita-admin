import { Logo } from '@/components/Logo';
import { currentStage, STAGE_LABEL } from '@/lib/stage';

/**
 * ログイン・パスワード設定画面の枠。
 * 背景はサイトのキービジュアル (kulapita/public/hero-parallax の各レイヤーを 1 枚に重ねた画像)。
 * 素材の一番上の空まで使い、上端に合わせて表示する (人物が画面の下寄りになる)。
 */
export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  const stage = currentStage();
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[#fef1dc] bg-[url('/login-bg.webp')] bg-cover bg-top px-4 pt-10 pb-16">
      {/* 背景の絵が少し透けるよう、白は少し透過させる */}
      <div className="w-full max-w-lg rounded-xl bg-white/75 p-8 shadow-xl ring-1 ring-black/5 backdrop-blur-sm">
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
      {/* 画面の下・中央に著作権表示 (背景の絵の上でも読めるよう、薄い白の帯を敷く) */}
      <footer className="absolute inset-x-0 bottom-4 flex justify-center px-4">
        <p className="rounded-full bg-white/60 px-3 py-1 text-xs text-slate-700 backdrop-blur-sm">
          © 2026 kulapita. All rights reserved.
        </p>
      </footer>
    </main>
  );
}
