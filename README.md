# kulapita-admin

kulapita の管理画面です。社内の許可された IP からだけ使えます。

- dev: https://dev-admin.kulapita.com
- 本番: https://admin.kulapita.com (未構築)

## できること (v1)

| 画面 | 内容 | 必要な権限 |
| --- | --- | --- |
| ダッシュボード | 未対応のお問い合わせ件数など | 閲覧のみ 以上 |
| お問い合わせ | 一覧・詳細、対応状況 / 担当者 / 対応メモの更新 | 閲覧は全員、更新は 担当者 以上 |
| メルマガ登録者 | 一覧 | 閲覧のみ 以上 |
| プレゼント応募 | 一覧・景品ごとの応募数/当選数、会員情報 (会員番号を押すとモーダル表示)、当選/落選の設定 (当選者数まで) | 閲覧は全員、結果の設定は 担当者 以上 |
| CSV ダウンロード | 上の 3 つ | 管理者 以上 |
| 操作ログ | 誰がいつ何をしたか | 管理者 以上 |
| 管理者アカウント | 追加・権限変更・停止・仮パスワード再発行（ロック解除も兼ねる） | スーパー管理者 |
| 許可 IP | CIDR で追加・削除 (WAF にも自動で反映) | スーパー管理者 |

ログインは「メールアドレス + パスワード」です（入口を許可 IP で制限しているため、2 段階認証は使いません）。
初回ログイン時と仮パスワード再発行後は、自分のパスワードの設定を求められます。
5 回続けて失敗すると 15 分ロックされます。

## 構成

```
利用者 ─ HTTPS ─▶ WAF (許可 IP 以外は 403) ─▶ ALB ─▶ ECS Fargate (このアプリ) ─ RDS Data API ─▶ Aurora MySQL
```

- AWS 側の定義は [kulapita-infra](https://github.com/a-lifes/kulapita-infra) の `lib/admin-stack.ts`
- コンテナイメージは `cdk deploy` のときに AWS CodeBuild がこのフォルダの Dockerfile からビルドします
  (kulapita-infra と同じ階層にこのリポジトリを置いてください)
- 許可 IP は DB の `admin_allowed_ips` テーブルで管理し、変更時に WAF の IP セットへ反映します。
  アプリ側 (src/proxy.ts) でも同じ一覧で二重にチェックします
- DB には管理画面専用の DB ユーザー (SELECT / INSERT / UPDATE のみ) で接続します
- プレゼントの当選者数は microCMS (presents の items[].winners) から読みます。API キーは Secrets Manager の
  `kulapita/<stage>/admin-microcms` に `{"serviceDomain": "...", "apiKey": "..."}` で入れます (kulapita-infra の README 参照)

## 反映 (デプロイ)

このリポジトリを更新したら、kulapita-infra で次を実行します (イメージのビルドからコンテナの入れ替えまで自動)。

```
cd ../kulapita-infra
npm run deploy:dev
```

## ローカルで動かす

dev に反映しなくても、手元の Mac ですぐ確認できます。

```
npm install
npm run setup:local
npm run dev
```

http://localhost:3100 を開きます。

- `setup:local` は AWS (プロファイル `kulapita`) から dev の DB の場所を取得して `.env.local` を作ります (初回だけ)
- ログインは dev と同じアカウントです。**ローカルでも dev の DB を読み書きする**ので、操作には注意してください
- ローカルでは IP チェックをしません。許可 IP を変更すると dev の WAF にも反映します
- ソースを保存すると画面に自動で反映されます

## チェック

```
npm run lint
npm run typecheck
npm run build
```
