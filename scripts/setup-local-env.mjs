/**
 * ローカル (http://localhost:3100) で管理画面を動かすための .env.local を作る。
 *
 *   npm run setup:local
 *
 * AWS (プロファイル kulapita) から dev の DB の場所を取得して書き込む。
 * パスワードなどの秘密情報はファイルに書かない (実行時に AWS から読む)。
 * ※ ローカルでも dev の DB に接続するので、操作した内容は dev に反映される。
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const PROFILE = 'kulapita';
const REGION = 'ap-northeast-1';

function outputs(stack) {
  const json = execFileSync(
    'aws',
    ['cloudformation', 'describe-stacks', '--stack-name', stack, '--profile', PROFILE, '--region', REGION, '--output', 'json'],
    { encoding: 'utf8' },
  );
  const list = JSON.parse(json).Stacks?.[0]?.Outputs ?? [];
  return Object.fromEntries(list.map((o) => [o.OutputKey, o.OutputValue]));
}

const db = outputs('Kulapita-dev-Database');
if (!db.ClusterArn || !db.AdminAppSecretArn) {
  console.error('✖ Kulapita-dev-Database の出力が見つかりません (kulapita-infra で deploy:dev 済みか確認してください)');
  process.exit(1);
}

// 既に .env.local があれば AUTH_SECRET は引き継ぐ (変えるとローカルのログインが切れるだけなので、無ければ作る)
const previous = existsSync('.env.local') ? readFileSync('.env.local', 'utf8') : '';
const authSecret = previous.match(/^AUTH_SECRET=(.+)$/m)?.[1] ?? randomBytes(32).toString('hex');

writeFileSync(
  '.env.local',
  [
    '# npm run setup:local で作成 (git には入らない)',
    `AWS_PROFILE=${PROFILE}`,
    `AWS_REGION=${REGION}`,
    'STAGE=local',
    `DB_CLUSTER_ARN=${db.ClusterArn}`,
    `DB_SECRET_ARN=${db.AdminAppSecretArn}`,
    'MICROCMS_SECRET_ARN=kulapita/dev/admin-microcms',
    `AUTH_SECRET=${authSecret}`,
    '# ローカルでは IP チェックをしない (本番ビルドでは無視される)',
    'ADMIN_SKIP_IP_CHECK=1',
    '# WAF の IP セットは空 (ローカルから WAF は変更しない)',
    'WAF_IPSET_NAME=',
    'WAF_IPSET_ID=',
    '',
  ].join('\n'),
);
console.log('✔ .env.local を作成しました。npm run dev で http://localhost:3100 を開いてください');
