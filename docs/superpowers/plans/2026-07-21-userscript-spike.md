# userscript 版 Spike 検証プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **ただしこのプランは spike(実機検証実験)である。** TDD サイクルは適用しない。成果物は検証スニペットと spike レポート。検証はログイン済みの実ブラウザ(claude-in-chrome)が必須のため、subagent ではなくインライン実行を推奨。

**Goal:** スペック `docs/superpowers/specs/2026-07-21-userscript-bookmarklet-design.md` の成立条件 4 項目を実機検証し、本実装プランの前提を確定する。

**Architecture:** tumblr.com 上でコンソール/ブックマークレットから実行するスニペット群を `spike/` に用意し、ユーザーのログイン済み Chrome(claude-in-chrome)で順に実行して結果をレポートに記録する。

**Tech Stack:** 素の JavaScript(ビルドなし、ページコンテキスト実行)、claude-in-chrome(javascript_tool / read_console_messages)。

## Global Constraints

- スニペットは依存ゼロの素の JS。ページの `window.fetch` を差し替えるが、**必ず元レスポンスへのフォールバック**を持ち、ダッシュボードを壊さない。
- リブログ検証は自分のプライマリブログに対して行い、検証後に該当リブログを削除する。
- 検証結果(成功/失敗、レスポンス形式のメモ、コンソールログ)はすべて Task 5 のレポートに記録する。
- `alert`/`confirm` 等のダイアログは使わない(ブラウザ自動化が固まるため)。ログは `console.log('[spike] …')` に統一。

## 検証項目(スペックの Spike 節と対応)

| # | 項目 | 成立しない場合 |
|---|---|---|
| A | 内部 API がセッション認証+拝借ヘッダーで叩けるか(following / blog posts `before`) | 設計不成立。公開 API + 各自キー方式へ後退検討 |
| B | dashboard レスポンスに他ブログのポストを混ぜて Tumblr React が描画・リブログできるか | DOM 注入へ後退検討 |
| C | Tumblr の CSP 下で `javascript:` ブックマークレットが実行できるか | ブックマークレット形態を落とし userscript のみに |
| D | クリック起動後に SPA 再遷移でタイムライン再取得を誘発できるか | ブックマークレットは「起動後スクロール分から置換」にフォールバック |

---

### Task 1: 検証スニペット一式の作成

**Files:**
- Create: `spike/README.md`
- Create: `spike/01-capture-and-probe.js`(検証 A)
- Create: `spike/02-replace-timeline.js`(検証 B)
- Create: `spike/03-bookmarklet.txt`(検証 C)
- Create: `spike/04-spa-renav.js`(検証 D)

**Interfaces:**
- Consumes: なし
- Produces: Task 2〜4 が実機で実行するスニペット。`01` はヘッダー捕獲結果を `window.__spikeHeaders` に、`02` は `window.__spikeHeaders` を利用。

- [ ] **Step 1: `spike/README.md` を作成**

```markdown
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
```

- [ ] **Step 2: `spike/01-capture-and-probe.js` を作成**

fetch をラップして Tumblr web client が付ける認証ヘッダーを捕獲し、それを拝借して following 一覧と blog posts(`before` 付き)を叩く。

```javascript
// 検証 A: 内部 API がセッション認証 + 拝借ヘッダーで叩けるか
(() => {
	if (window.__spikeHooked) {
		console.log('[spike] already hooked');
		return;
	}
	window.__spikeHooked = true;
	const orig = window.fetch.bind(window);
	window.__spikeOrigFetch = orig;

	const probe = async (headers) => {
		const get = async (path) => {
			const res = await orig(`https://www.tumblr.com${path}`, { headers });
			const body = await res.json().catch(() => null);
			return { status: res.status, body };
		};
		const following = await get('/api/v2/user/following?limit=3');
		console.log('[spike] following status:', following.status);
		console.log(
			'[spike] following blogs:',
			following.body?.response?.blogs?.map((b) => b.name),
		);
		const blogName = following.body?.response?.blogs?.[0]?.name;
		if (!blogName) {
			console.warn('[spike] no blog name — following probe failed');
			return;
		}
		// before=2015-01-01T00:00:00Z 相当。過去ポストが返るか確認する
		const posts = await get(
			`/api/v2/blog/${blogName}/posts?npf=true&limit=3&before=1420070400`,
		);
		console.log('[spike] posts status:', posts.status);
		console.log(
			'[spike] posts timestamps:',
			posts.body?.response?.posts?.map((p) =>
				new Date(p.timestamp * 1000).toISOString(),
			),
		);
		console.log(
			'[spike] posts keys sample:',
			Object.keys(posts.body?.response?.posts?.[0] ?? {}),
		);
	};

	window.fetch = async (input, init) => {
		const url = typeof input === 'string' ? input : input.url;
		if (!window.__spikeHeaders && url.includes('/api/v2/')) {
			const headers =
				input instanceof Request
					? new Headers(input.headers)
					: new Headers(init?.headers);
			window.__spikeHeaders = headers;
			console.log('[spike] captured headers:', [...headers.keys()]);
			probe(headers).catch((e) => console.warn('[spike] probe failed:', e));
		}
		return orig(input, init);
	};
	console.log('[spike] fetch hooked — scroll the dashboard to trigger a request');
})();
```

- [ ] **Step 3: `spike/02-replace-timeline.js` を作成**

dashboard タイムラインのレスポンスの `elements` を、フォロー中ブログの過去ポストに丸ごと差し替える。実行後に SPA 遷移(検証 D のスニペットまたは手動でホームクリック)して描画を確認する。

```javascript
// 検証 B: dashboard レスポンスに他ブログの過去ポストを混ぜて描画・リブログできるか
(() => {
	const orig = window.__spikeOrigFetch ?? window.fetch.bind(window);
	const headers = window.__spikeHeaders;
	if (!headers) {
		console.warn('[spike] run 01-capture-and-probe.js first (need captured headers)');
		return;
	}

	const fetchDonorPosts = async () => {
		const fRes = await orig('https://www.tumblr.com/api/v2/user/following?limit=20', {
			headers,
		});
		const fBody = await fRes.json();
		const blogs = fBody.response.blogs;
		const blog = blogs[Math.floor(blogs.length / 2)]; // 適当に1ブログ選ぶ
		const pRes = await orig(
			`https://www.tumblr.com/api/v2/blog/${blog.name}/posts?npf=true&limit=10&before=1577836800`,
			{ headers },
		);
		const pBody = await pRes.json();
		console.log('[spike] donor blog:', blog.name, 'posts:', pBody.response.posts.length);
		return pBody.response.posts;
	};

	window.fetch = async (input, init) => {
		const url = typeof input === 'string' ? input : input.url;
		const res = await orig(input, init);
		if (!url.includes('/api/v2/timeline/dashboard')) return res;
		try {
			const body = await res.clone().json();
			const donor = await fetchDonorPosts();
			const original = body.response.timeline.elements;
			console.log(
				'[spike] original element sample keys:',
				Object.keys(original?.[0] ?? {}),
			);
			body.response.timeline.elements = donor;
			console.log('[spike] REPLACED timeline elements:', donor.length);
			return new Response(JSON.stringify(body), {
				status: res.status,
				statusText: res.statusText,
				headers: res.headers,
			});
		} catch (e) {
			console.warn('[spike] replace failed — passthrough:', e);
			return res;
		}
	};
	console.log('[spike] replace hook armed — re-navigate to dashboard to trigger');
})();
```

- [ ] **Step 4: `spike/03-bookmarklet.txt` を作成**

CSP 検証用の最小ブックマークレット。実行できたことと、fetch 差し替えまで通ることだけ確認する。

```text
javascript:(()=>{console.log('[spike-bm] executed on',location.href);const o=window.fetch;window.fetch=async(...a)=>{console.log('[spike-bm] fetch intercepted:',typeof a[0]==='string'?a[0]:a[0].url);window.fetch=o;return o(...a)};console.log('[spike-bm] fetch wrapped once')})();
```

- [ ] **Step 5: `spike/04-spa-renav.js` を作成**

```javascript
// 検証 D: プログラムから SPA 再遷移してタイムライン再取得を誘発できるか
(() => {
	const findLink = (href) =>
		[...document.querySelectorAll('a')].find(
			(a) => a.getAttribute('href') === href,
		);
	const dash = findLink('/dashboard');
	if (!dash) {
		console.warn('[spike] dashboard link not found');
		return;
	}
	// 一旦別ルートへ行って戻ると確実に再取得される想定。まず直接クリックを試す
	console.log('[spike] clicking dashboard link…');
	dash.click();
	setTimeout(() => {
		console.log(
			'[spike] if no timeline request fired, try: navigate to Likes then back',
		);
	}, 1500);
})();
```

- [ ] **Step 6: コミット**

```bash
git add spike/
git commit -m "Add spike snippets for userscript feasibility checks"
```

---

### Task 2: 検証 A の実施 — 内部 API のセッション認証

**Files:**
- 変更なし(実機検証)。結果メモは Task 5 のレポートへ。

**Interfaces:**
- Consumes: `spike/01-capture-and-probe.js`
- Produces: 捕獲ヘッダーの内訳(どのヘッダーが認証に効いているか)、following/posts レスポンスの形式メモ、`window.__spikeHeaders`(Task 3 が使用)

- [ ] **Step 1: claude-in-chrome でログイン済み Chrome に接続し、`https://www.tumblr.com/dashboard` のタブを開く**

tabs_context_mcp → 新規タブ作成 → navigate。ログインしていなければユーザーに依頼して中断。

- [ ] **Step 2: javascript_tool で `spike/01-capture-and-probe.js` の中身を実行**

Expected: コンソールに `[spike] fetch hooked` が出る。

- [ ] **Step 3: ページをスクロールして API リクエストを発火させる**

computer ツールでスクロール。Expected: `[spike] captured headers` に続き、`following status: 200`、ブログ名一覧、`posts status: 200`、2015-01-01 以前のタイムスタンプ列が出る。

- [ ] **Step 4: read_console_messages(pattern: `\[spike\]`)で結果を回収し記録**

判定:
- following/posts とも 200 + 中身あり → **A 成立**
- 401/403 → 捕獲ヘッダーの中身を確認し、Authorization 以外(Cookie 同送で足りるか等)を切り分けて再試行。それでも通らなければ **A 不成立** として記録

---

### Task 3: 検証 B の実施 — タイムライン置換の描画とリブログ

**Files:**
- 変更なし(実機検証)。結果メモは Task 5 のレポートへ。

**Interfaces:**
- Consumes: Task 2 実施済みタブ(`window.__spikeHeaders`)、`spike/02-replace-timeline.js`、`spike/04-spa-renav.js`
- Produces: 置換描画の成否、blog posts と timeline elements の形式差メモ、リブログ動作の成否

- [ ] **Step 1: Task 2 と同じタブで `spike/02-replace-timeline.js` を実行**

Expected: `[spike] replace hook armed` が出る。

- [ ] **Step 2: `spike/04-spa-renav.js` を実行してタイムライン再取得を誘発(検証 D の前半を兼ねる)**

Expected: `[spike] REPLACED timeline elements: N` が出て、ダッシュボードに 2020 年以前の他ブログのポストが並ぶ。

- [ ] **Step 3: スクリーンショットで描画を確認**

判定: ポストカードが正常に描画(画像・本文・ヘッダー・フッター)されていれば **B(描画)成立**。白抜け・エラーバウンダリ表示なら `original element sample keys` と donor の keys の差分をコンソールから回収し、形式差(欠けフィールド)を記録。

- [ ] **Step 4: 置換ポストを 1 件リブログしてみる**

リブログボタン → 自分のプライマリブログへ投稿。Expected: 成功トースト。成功なら **B(リブログ)成立**。直後に自分のブログから該当リブログを削除する。

- [ ] **Step 5: read_console_messages で `[spike]` ログを全回収して記録**

---

### Task 4: 検証 C・D の実施 — ブックマークレット CSP と SPA 再遷移

**Files:**
- 変更なし(実機検証)。結果メモは Task 5 のレポートへ。

**Interfaces:**
- Consumes: `spike/03-bookmarklet.txt`、Task 3 での `04-spa-renav.js` 実行結果
- Produces: C/D の成否

- [ ] **Step 1: 検証 C はユーザーの手動操作を依頼**

ブックマークレットはブラウザ自動化から実行できないため、ユーザーに依頼する:
1. `spike/03-bookmarklet.txt` の中身をブックマークの URL として登録
2. tumblr.com のタブでクリック

- [ ] **Step 2: read_console_messages(pattern: `\[spike-bm\]`)で確認**

Expected: `[spike-bm] executed` と `[spike-bm] fetch wrapped once`。出れば **C 成立**。出なければ(CSP でブロックなら)DevTools コンソールにブロックログが出るはずなのでそれを記録し **C 不成立**。

- [ ] **Step 3: 検証 D の判定**

Task 3 Step 2 で `dash.click()` によりタイムライン再取得が誘発されたか確認。誘発されていれば **D 成立**。されていなければ「Likes へ遷移 → ダッシュボードへ戻る」をプログラムクリックで試し、それでも再取得しなければ **D 不成立**(スクロール分から置換にフォールバック)として記録。

---

### Task 5: Spike レポート作成とスペック更新

**Files:**
- Create: `docs/superpowers/specs/2026-07-21-userscript-spike-report.md`
- Modify: `docs/superpowers/specs/2026-07-21-userscript-bookmarklet-design.md`(結果を反映)

**Interfaces:**
- Consumes: Task 2〜4 の判定と記録
- Produces: 本実装プラン作成の前提となる確定事項

- [ ] **Step 1: レポートを書く**

以下の構成で、各検証の成否・実レスポンスの形式メモ・判明した制約を記録する:

```markdown
# userscript 版 Spike レポート(2026-07-21)

| # | 項目 | 結果 |
|---|---|---|
| A | 内部 API セッション認証 | 成立 / 不成立(詳細) |
| B | タイムライン置換の描画・リブログ | 成立 / 不成立(詳細) |
| C | ブックマークレット CSP | 成立 / 不成立(詳細) |
| D | SPA 再遷移誘発 | 成立 / 不成立(詳細) |

## 判明した事実
- 認証に必要なヘッダー: …
- timeline elements と blog posts の形式差: …
- ページング(_links.next)の実形式: …

## 設計への影響
- …
```

- [ ] **Step 2: スペックの Spike 節に結果サマリーを追記し、不成立項目があれば該当設計を修正**

- [ ] **Step 3: コミット**

```bash
git add docs/superpowers/specs/
git commit -m "Record userscript spike results"
```

- [ ] **Step 4: 本実装プランの作成へ**

spike が成立していれば、superpowers:writing-plans で本実装プラン(`packages/core/` 切り出し → `packages/userscript/` → デュアルビルド → 配布)を作成する。

## Self-Review 済みチェック

- スペックの Spike 節 4 項目すべてにタスクが対応(A→Task 2、B→Task 3、C/D→Task 4)
- プレースホルダーなし(全スニペットは完全なコード)
- `window.__spikeHeaders` / `window.__spikeOrigFetch` の受け渡しは 01→02 で一貫
