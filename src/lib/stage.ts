/** 実行中の環境 (ECS の環境変数 STAGE。ローカルでは local) */
export function currentStage(): 'prod' | 'dev' | 'local' {
  const s = process.env.STAGE;
  return s === 'prod' || s === 'dev' ? s : 'local';
}

export const STAGE_LABEL = { prod: '本番環境', dev: '開発環境', local: 'ローカル環境' } as const;
