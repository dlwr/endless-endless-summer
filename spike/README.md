# Spike スニペット

スペック docs/superpowers/specs/2026-07-21-userscript-bookmarklet-design.md の成立検証用。
tumblr.com のログイン済みタブのページコンテキストで実行する。

| ファイル | 検証 | 実行方法 |
|---|---|---|
| 01-capture-and-probe.js | A: 内部 API のセッション認証 | ダッシュボードで実行 → スクロールして API リクエストを発火させる |
| 02-replace-timeline.js | B: タイムライン置換描画 | 01 実行済みタブで実行 → SPA 遷移でタイムライン再取得 |
| 03-bookmarklet.txt | C: ブックマークレット CSP | 内容をブックマークの URL に登録し tumblr.com でクリック(手動) |
| 04-spa-renav.js | D: SPA 再遷移によるタイムライン再取得 | ダッシュボードで実行 |
| 05-spike.user.js | A/B/SW: document_start でのレスポンス介入・置換 | **Tampermonkey にインストールして dashboard を開く**(下記) |

結果は docs/superpowers/specs/2026-07-21-userscript-spike-report.md に記録する。

## 判明済みの事実(2026-07-21)

- セッション cookie だけ(`credentials: include`)では内部 API は `401`。Bearer トークンが要る。
- トークンはアプリが fetch 呼び出しの `init.headers` で個別に付ける(グローバル fetch ラッパー層ではない)。
- アプリは初期化時に `window.fetch` 参照をキャッシュするため、**ロード後の eval ラップはアプリのリクエストを素通り**する。→ 受動捕獲は `@run-at document_start` が必須。ロード後起動のブックマークレットでは受動捕獲不可(検証 C の位置づけに影響)。

## 05-spike.user.js の使い方

ロード後 eval では原理的にレスポンス介入を検証できない(上記キャッシュ問題)ため、本物の document_start ユーザースクリプトで検証する。

1. Tampermonkey に `05-spike.user.js` を新規スクリプトとして貼り付けて保存。
2. `https://www.tumblr.com/dashboard` を開く。
3. DevTools コンソール(フィルタ `[spike]`)を見る。
   - **Stage 1(既定・認証ゼロ)**: 既存ポストの並びが反転して見えれば「介入+書き換え+React 再描画」成立。`INTERCEPTED dashboard` が初回描画で出るか、スクロール後に出るかをメモ(初回が埋め込み由来なら「完全置換」は初回画面に効かない=検証 D が必須になる)。フックが一度も発火しなければタイムライン取得は SW 発 or 埋め込み → 設計に重大影響。
   - **Stage 2(認証あり)**: コンソールで `localStorage.setItem('esSpikeStage','2')` → リロード。フォロー中ブログの過去ポストで丸ごと置換される。描画されたら、注入ポストを1件リブログして成功するか確認(確認後そのリブログは削除する)。
4. 検証後は `localStorage.removeItem('esSpikeStage')` とスクリプト無効化。
