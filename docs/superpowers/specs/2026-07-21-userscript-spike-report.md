# userscript 版 Spike レポート(2026-07-21)

スペック `2026-07-21-userscript-bookmarklet-design.md` の成立検証。実機(ユーザーのログイン済み Chrome + Tampermonkey、`spike/05-spike.user.js`)で実施。

## 結果サマリー

| # | 項目 | 結果 |
|---|---|---|
| A | 内部 API のセッション認証(captured token) | **成立** |
| B | タイムライン介入・置換の描画 | **成立** |
| C | ブックマークレット形態 | **不成立(本方式と原理的に非互換)** |
| D | 初回画面(埋め込み)への到達 | 実装で要対応(下記) |
| — | document_start フックの必要性・十分性 | **必要かつ十分と確認** |
| — | ネイティブキーボード(注入ポスト) | **成立**(J/K ナビ・T リブログ・L ライクが注入ポストでも動作) |

## 判明した事実

### 認証(検証 A)
- セッション cookie だけ(`credentials: include`)では内部 API は `401 Unauthorized`。
- Tumblr web はリクエストごとに `init.headers` へ Bearer トークンを付与する(グローバル fetch ラッパー層ではない)。
- document_start でラップした fetch から、アプリの送信ヘッダーに乗る `Authorization` を捕獲し、それを再利用すると `/api/v2/user/following`・`/api/v2/blog/{name}/posts?before=` とも `200`。→ **captured token 方式で内部 API を叩ける**。

### 介入と描画(検証 B・document_start)
- **post-load の eval ラップはアプリのリクエストを素通り**する(`headersCaptured: false`)。アプリは初期化時に `window.fetch` 参照をキャッシュするため。
- **`@run-at document_start` でラップすると、アプリがキャッシュするのが「我々のラッパー」になり**、以降のダッシュボード取得を介入できる。→ document_start は **必要かつ十分**。
- Stage 1(既存 elements を反転)で並びが反転描画された。Stage 4(変換 donor を先頭注入)で他ブログの過去ポストが先頭にネイティブ描画された。→ **レスポンス書き換え → React 再描画が成立**。スクロールで読み込まれるバッチは `window.fetch` 発(Service Worker 発ではない)。

### スキーマ差(重要)
- ダッシュボードの `timeline.elements` は **camelCase**(`objectType, originalType, blogName, postUrl, reblogKey, noteCount, streamGlobalPosition, streamSessionId …`)。
- `/api/v2/blog/{name}/posts` の戻り値は **snake_case**(`object_type, original_type, blog_name, post_url, reblog_key, note_count, stream_global_position, stream_session_id …`)。
- **フィールド集合は実質同一**。**深い(再帰的)snake→camel キー変換**をかければダッシュボード要素と同形になり、ネイティブ描画できる(Stage 4 で実証)。
- ダッシュボード側にのみ存在する追加フィールド: `displayType, sponsoredBadgeUrl, headerContext, headerCta`(表示・広告系)、`rebloggedFrom*` / `rebloggedRoot*`(リブログ trail 系)。素のポスト描画には不要。

### 丸ごと置換の失敗(ページング)
- 全 `/timeline/dashboard` レスポンスを固定 donor で丸ごと置換すると、**無限ローディングに陥る**(同一 ID が返り続け append されず、無限スクローラーが再取得を繰り返す)。
- → 「完全置換モード」は、タイムラインの封筒(`_links.next` 等)と `streamGlobalPosition`/`streamSessionId` を**自前で一貫生成**し、ページごとに新しいランダムポスト・ユニーク ID・前進するカーソルを返す実装が必要。

### 初回画面(検証 D)
- 初回表示分は fetch を経由しない(サーバー埋め込み `___INITIAL_STATE___`)可能性が高い(Stage 1 では反転がスクロール後に初めて見えた)。Stage 4 では注入ポストが先頭に描画されたため、少なくとも早期の dashboard fetch には介入が届く。
- → 「初回画面から完全置換」するには、埋め込み state の書き換え、または起動直後の再取得誘発が要る。実装で対応する項目。

### ブックマークレット非互換(検証 C・設計影響大)
- 本方式は **document_start でアプリより先に fetch をラップする**ことが前提。
- **ブックマークレットはページロード後のクリック起動**なので、その時点でアプリは既に元の `window.fetch` をキャッシュ済み。ブックマークレットがラップしてもアプリのタイムライン取得は素通りし、**レスポンス介入ができない**(post-load eval が素通りしたのと同一原理)。
- → **fetch 介入方式ではブックマークレット形態は成立しない**。ブックマークレットで実現するには DOM / React-state 直接注入という別方式が必要で、これは設計時に却下した壊れやすい経路。

## 設計への影響

1. **配布形態はユーザースクリプト単独にする**(ブックマークレットのデュアルビルドは撤回)。fetch 介入方式と原理的に両立しない。
2. `packages/core` に **snake→camel 深変換**と、**自前タイムライン封筒生成(stream positions / `_links` / カーソル)** を持たせる。
3. donor 取得は captured token を再利用(トークン値は保存・露出しない)。
4. 初回画面の扱い(埋め込み state 書き換え or 再取得誘発)を実装タスクに含める。

### キーボード(検証で判明)

- **Tumblr ネイティブのショートカットが注入ポストでもそのまま効く**: `J/K`=ポスト移動、`T`=リブログ、`L`=ライク。→ 2026-07-17 に userscript を却下した理由(キーボード自前実装)は大幅に軽減。ナビ・リブログ・ライクはネイティブ流用でよい。
- userscript 側で自前実装が要るのは**非ネイティブな独自アクションのみ**: `r`=フィード全リロール(userscript 固有)、`?`=ヘルプ、`o`=元ポストを新規タブ。`shift+t`(タグ/投稿先ダイアログ)はネイティブ `T` のリブログダイアログで代替できるか実装時に確認。
