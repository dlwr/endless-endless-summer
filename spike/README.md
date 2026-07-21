# Spike スニペット

スペック docs/superpowers/specs/2026-07-21-userscript-bookmarklet-design.md の成立検証用。
tumblr.com のログイン済みタブのページコンテキストで実行する。

| ファイル | 検証 | 実行方法 |
|---|---|---|
| 01-capture-and-probe.js | A: 内部 API のセッション認証 | ダッシュボードで実行 → スクロールして API リクエストを発火させる |
| 02-replace-timeline.js | B: タイムライン置換描画 | 01 実行済みタブで実行 → SPA 遷移でタイムライン再取得 |
| 03-bookmarklet.txt | C: ブックマークレット CSP | 内容をブックマークの URL に登録し tumblr.com でクリック(手動) |
| 04-spa-renav.js | D: SPA 再遷移によるタイムライン再取得 | ダッシュボードで実行 |

結果は docs/superpowers/specs/2026-07-21-userscript-spike-report.md に記録する。
