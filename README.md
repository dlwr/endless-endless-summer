# endless endless summer

A Tumblr dashboard that forgets what time it is.

フォロー中ブログの過去ポストを、時系列を無視して 2007 年以降から**年均等**にランダム表示する Tumblr ダッシュボード代替。ユーザースクリプト「endless summer」と Web サービス「reblogen」の精神的後継。

## 特徴

- フォロー中ブログからのランダムフィード(ポスト数の多い年に偏らない年均等サンプリング)
- キーボード駆動: `j`/`k` 移動、`t` 即リブログ、`shift+t` コメント付きリブログ、`l` like、`o` 元ポスト、`r` 全リロール、`?` ヘルプ
- ポストタイプフィルタ(text / image / link / audio / video)
- Tumblr OAuth2 ログイン(マルチユーザー対応)

## スタック

Cloudflare Workers + Hono + KV / React 19 + Vite / TypeScript / Vitest / Biome / pnpm

## 開発

```sh
pnpm install
cp .dev.vars.example .dev.vars  # Tumblr の consumer key/secret を記入
pnpm dev                        # http://localhost:5173
pnpm test                       # Vitest(worker: node 環境 / app: jsdom 環境)
pnpm check                      # Biome
```

Tumblr アプリは https://www.tumblr.com/oauth/apps で登録し、callback URL に `http://localhost:5173/auth/callback`(開発)または本番 URL の `/auth/callback` を設定する。

## デプロイ

```sh
pnpm wrangler kv namespace create KV   # 初回のみ。id を wrangler.jsonc に設定
pnpm wrangler secret put TUMBLR_CLIENT_ID
pnpm wrangler secret put TUMBLR_CLIENT_SECRET
pnpm run deploy
```

## 構成

- `src/worker/` — Hono API(OAuth2 フロー、セッション、フィード生成、リブログ/like プロキシ)
- `src/app/` — React SPA(フィード UI、NPF レンダラー、キーボード操作)
- `src/shared/types.ts` — worker/app 共有型
- `docs/superpowers/plans/` — 実装計画

ランダム抽出は Tumblr API の `before` パラメータに「2007〜現在からランダムに選んだ年内のランダム時刻」を渡すオンデマンド方式。各ブログの「これ以前にポストは無い」下限は KV に学習してリトライを減らす。
