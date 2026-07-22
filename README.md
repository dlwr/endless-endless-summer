# endless endless summer

A Tumblr dashboard that forgets what time it is.

フォロー中ブログの過去ポストを、時系列を無視して 2007 年以降から**年均等**にランダム表示する Tumblr ダッシュボード代替。ユーザースクリプト「endless summer」と Web サービス「reblogen」の精神的後継。

## 特徴

- フォロー中ブログからのランダムフィード(ポスト数の多い年に偏らない年均等サンプリング)
- キーボード駆動: `j`/`k` 移動、`t` 即リブログ、`shift+t` コメント付きリブログ、`l` like、`o` 元ポスト、`r` 全リロール、`?` ヘルプ
- ポストタイプフィルタ(text / image / link / audio / video)
- Tumblr OAuth2 ログイン(マルチユーザー対応)

## ユーザースクリプト版(推奨・レートリミット回避)

Tumblr の consumer key はキー単位で 1,000/時・5,000/日を全ユーザーで共有するため、公開 Web サービスとしてはスケールしない(緩和申請も却下)。そこで **tumblr.com 上で動くユーザースクリプト**を用意した。ユーザー自身のログインセッションを使うのでレートリミットはユーザー単位になり、consumer key も不要。ダッシュボードのタイムラインを、フォロー中ブログの年均等ランダム過去ポストに置き換え、描画・操作は Tumblr 本体に任せる。

### インストール

1. Tampermonkey などのユーザースクリプトマネージャを導入
2. `pnpm build:userscript` で `dist/endless-endless-summer.user.js` を生成(または Releases から取得)
3. マネージャに新規スクリプトとしてインストール
4. `https://www.tumblr.com/dashboard` を開く

### 使い方

- スクロールするたびに 2007〜現在の年均等ランダム過去ポストが積まれる
- 操作は Tumblr ネイティブのショートカット: `J`/`K` 移動、`L` ライク、`Shift+R` リブログ
- 画面右下の「∞ summer」ボタンで置換の on/off(リロードで維持)

### 既知の制限

- **初回表示分は素のダッシュボード**(サーバー埋め込みで fetch を経由しないため)。スクロールから置換が始まる。
- **`t`=即リブログ等の独自キーボードスキームは未実装**(follow-up)。現状はネイティブの `Shift+R` を使う。
- **ブックマークレットは非対応**。fetch 介入は `@run-at document_start` でアプリより先にフックする必要があり、ロード後起動のブックマークレットとは原理的に両立しない。
- GIF 自動再生は Tumblr / OS 設定(視差効果を減らす等)依存で、本スクリプトの管轄外。

### プライバシー

セッションの Bearer トークンはブラウザのメモリ内でのみ使用し、保存・外部送信・ログ出力しない。内部 API 呼び出しはすべてユーザー自身の tumblr.com セッションで行う。

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

- `src/core/` — フレームワーク非依存の共有ロジック(年均等サンプリング、フィード構築、snake→camel 変換)。worker と userscript の両方が使う
- `src/worker/` — Hono API(OAuth2 フロー、セッション、フィード生成、リブログ/like プロキシ)
- `src/app/` — React SPA(フィード UI、NPF レンダラー、キーボード操作)
- `src/userscript/` — ユーザースクリプト(fetch フック、内部 API クライアント、ページング封筒、トグル)
- `src/shared/types.ts` — worker/app 共有型
- `build/userscript.mjs` — esbuild で `.user.js` を生成
- `docs/superpowers/plans/` — 実装計画

ランダム抽出は Tumblr API の `before` パラメータに「2007〜現在からランダムに選んだ年内のランダム時刻」を渡すオンデマンド方式。各ブログの「これ以前にポストは無い」下限は KV に学習してリトライを減らす。
