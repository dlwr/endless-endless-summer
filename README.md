# endless endless summer

A Tumblr dashboard that forgets what time it is.

tumblr.com のダッシュボードを、フォロー中ブログの過去ポストで置き換えるユーザースクリプト。時系列を無視して 2007 年以降から**年均等**にランダムな過去ポストが無限スクロールで流れてくる。描画・操作は Tumblr 本体に任せるので、ネイティブのキーボード操作がそのまま効く。

## インストール

1. [Tampermonkey](https://www.tampermonkey.net/) などのユーザースクリプトマネージャを導入
2. [最新版をインストール](https://github.com/dlwr/endless-endless-summer/releases/latest/download/endless-endless-summer.user.js)(マネージャ導入済みなら、このリンクを開くとインストール画面が出る)
3. `https://www.tumblr.com/dashboard` を開く

`@updateURL` を埋め込んでいるので、以降は Tampermonkey が新版を自動検出する。

## 使い方

- スクロールするたびに 2007〜現在の年均等ランダム過去ポストが積まれる
- 操作は Tumblr ネイティブのショートカット: `J`/`K` 移動、`L` ライク、`Shift+R` リブログ
- 画面右下の「∞ summer」ボタンで置換の on/off(リロードで維持)

## 仕組み

`@run-at document_start` で Tumblr 本体より先に `window.fetch` をラップする。ダッシュボードのタイムライン API のレスポンスを、フォロー中ブログの年均等ランダム過去ポストに差し替えて返すだけ。描画は Tumblr 本体の React に任せるので、リブログ・ライク・キーボード操作はネイティブに動く。

ランダム抽出は blog posts API の `before` パラメータに「2007〜現在からランダムに選んだ年内のランダム時刻」を渡すオンデマンド方式。年ごとのポスト密度の偏りを補正して年均等にサンプリングする。各ブログの「これ以前にポストは無い」下限は学習してリトライを減らす。ページングは自前カーソル + 単調 `streamGlobalPosition` で前進させ、毎ページ新しいランダムポストを返す。

## 既知の制限

- **初回表示分は素のダッシュボード**(サーバー埋め込みで fetch を経由しないため)。スクロールから置換が始まる。
- **`t`=即リブログ等の独自キーボードスキームは未実装**(follow-up)。現状はネイティブの `Shift+R` を使う。
- **ブックマークレットは非対応**。fetch 介入は `@run-at document_start` でアプリより先にフックする必要があり、ロード後起動のブックマークレットとは原理的に両立しない。
- GIF 自動再生は Tumblr / OS 設定(視差効果を減らす等)依存で、本スクリプトの管轄外。

## プライバシー

セッションの Bearer トークンはブラウザのメモリ内でのみ使用し、保存・外部送信・ログ出力しない。内部 API 呼び出しはすべてユーザー自身の tumblr.com セッションで行う。

## 開発

```sh
pnpm install
pnpm test    # Vitest(core: node / userscript: node + 一部 jsdom)
pnpm check   # Biome
pnpm build   # esbuild → dist/endless-endless-summer.user.js
```

TypeScript / Vitest / esbuild / Biome / pnpm。

## 構成

- `src/core/` — フレームワーク非依存の共有ロジック(年均等サンプリング、フィード構築、snake→camel 変換)
- `src/userscript/` — ユーザースクリプト(fetch フック、内部 API クライアント、ページング封筒、ストレージ、トグル、キーマップ)
- `build/userscript.mjs` — esbuild で Tampermonkey ヘッダー付き `.user.js` を生成
- `docs/superpowers/` — 設計・spike レポート・実装計画

## リリース

```sh
# build/userscript.mjs の @version を上げてから
pnpm build
gh release create vX.Y.Z dist/endless-endless-summer.user.js --title vX.Y.Z --notes "..."
```

`@version` を上げれば既存ユーザーの Tampermonkey が自動更新する(上げ忘れると更新が飛ばない)。
