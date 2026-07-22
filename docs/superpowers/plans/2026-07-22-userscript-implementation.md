# userscript 版 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** tumblr.com のダッシュボードで、フォロー中ブログの年均等ランダム過去ポストにタイムラインを置換し、Tumblr 本体にネイティブ描画・操作(J/K/T/L)させるユーザースクリプトを作る。無限スクロールで毎ページ新しいランダムポストが継続表示され、エラー時は素のダッシュボードにフォールバックする。

**Architecture:** `@run-at document_start` で `window.fetch` をラップ(アプリより先=成立の前提、spike 実証済み)。送信ヘッダーから Bearer トークンを毎回捕獲し、内部 API(`www.tumblr.com/api/v2`)で donor ポストを取得。`src/core` の年均等サンプリングで `before=` を決め、snake→camel 深変換でダッシュボード要素形に整え、`/api/v2/timeline/dashboard` レスポンスの `timeline.elements` を差し替える。ページングは自前カーソル+単調 `streamGlobalPosition` で前進させる。

**Tech Stack:** TypeScript / Vitest(TDD)/ esbuild(userscript バンドル)/ Tampermonkey。既存: pnpm + Biome + Vite + Wrangler。

## Global Constraints

- 既存の共有ロジックは **`src/core/`**(フレームワーク非依存ディレクトリ)に置く。**monorepo 化(pnpm workspaces)はしない** — spec の「packages/core」意図はこれで満たす(packaging 詳細)。
- フックは**何が起きても素のレスポンスにフォールバック**し、ダッシュボードを壊さないことを最優先。パース失敗は静かに置換をやめ `console.warn('[ees] …')`。
- 捕獲した Bearer トークンは**メモリ内のみ**。保存・ログ出力・DOM 露出をしない。**毎回の認証付きリクエストで捕獲を更新**(Tumblr のトークンローテーション対策)。
- ログ prefix は `[ees]`(endless-endless-summer)。`alert`/`confirm` は使わない。
- TDD 必須(t_wada)。純粋ロジックは失敗するテスト→最小実装→緑→コミット。ブラウザ結合・スクローラー受理性は**ライブ検証ゲート**で判定(ユニットテスト不能な領域)。
- テスト実行: `pnpm exec vitest run <file>`。lint: `pnpm exec biome check .`。
- 内部 API のレスポンス fixture は**サニタイズ**(他者の個人情報・トークンを含めない)して commit する。

## スコープ

**本プランの成果物(v1 MVP)**: 上記 Goal まで(トグル on/off 含む)。
**follow-up(別プラン)**: 非ネイティブ独自キー(`r`=リロール、`?`=ヘルプ、`o`=元ポスト新規タブ、`shift+t`=ダイアログ)、設定 UI、配布ページ整備、タイプフィルタ。

## File Structure

- `src/core/sampling.ts` — 年均等サンプリング(`src/worker/sampling.ts` から移動)。純粋。
- `src/core/transform.ts` — `toCamel` / `deepCamel`(snake→camel 深変換)。純粋。
- `src/core/feed-sampling.ts` — `sampleFeed`(ランダムブログ選択・`before=` サンプリング・最古境界学習・shuffle)を `buildFeed` から抽出。`FeedClient`/`Storage` インターフェースで抽象化。`RawPost[]` を返す。
- `src/worker/feed.ts` — `buildFeed` を `sampleFeed` + `normalizePost` の薄いラッパに。KV→`Storage` アダプタを内包。
- `src/userscript/internal-client.ts` — 内部 API の `FeedClient` 実装(captured token)。
- `src/userscript/storage.ts` — `Storage` 実装(GM / localStorage、TTL 付き)。
- `src/userscript/timeline-page.ts` — 自前ページング封筒(単調 stream 位置、`_links.next` 温存)。
- `src/userscript/hook.ts` — fetch ラップ・トークン捕獲・dashboard 介入・フォールバック。
- `src/userscript/main.ts` — エントリ(トグル状態・GM メニュー・hook 設置)。
- `build/userscript.mjs` — esbuild で `main.ts` → `dist/endless-endless-summer.user.js`(Tampermonkey ヘッダー banner)。
- `spike/05-spike.user.js` — Task 1 で Stage 5(ライブ pagination ゲート)を追加。

---

### Task 1: ライブ pagination 連続性ゲート(Stage 5)【GATE】

spike が実証したのは注入機構のみ。**無限スクロールで毎ページ新しいランダムポストが append され前進する**ことは未実証(Stage 2 の丸ごと固定置換は無限ループした)。封筒の正しさは Tumblr スクローラーの受理次第でユニットテスト不能。ここを最初に実機で go/no-go する。

**Files:**
- Modify: `spike/05-spike.user.js`(Stage 5 を追加)

**Interfaces:**
- Consumes: 既存 spike の `origFetch` / captured auth / `deepCamel` / donor 取得
- Produces: 「自前カーソル+単調 stream 位置で複数ページ置換が append・前進する」ことの実機確認結果(Task 7 の封筒設計の前提)

- [ ] **Step 1: Stage 5 を追加**

`spike/05-spike.user.js` の使い方コメントに Stage 5 を追記し、STAGE 分岐に以下を追加する。毎ページ「ランダムブログ×ランダム `before=`」で異なる donor を取得(前回の観察=最新順問題の解消も兼ねる)、camel 化、単調 `streamGlobalPosition` を採番、`_links.next` は原レスポンスのものを温存してスクローラーを継続させる。

```javascript
// STAGE 5(ライブ pagination ゲート): localStorage.setItem('esSpikeStage','5') → リロード。
// 毎ページ異なるランダム過去ポストで elements を丸ごと置換し、streamGlobalPosition を
// 単調採番、_links.next は温存。スクロールし続けて (a) 毎回新しいポストが積まれるか
// (b) 無限ローディングに陥らないか (c) 同じポストの重複ループが起きないか を確認する。

// 追加のヘルパ(ファイル冒頭のユーティリティ群の近くに置く):
const TUMBLR_EPOCH_S = Date.UTC(2007, 0, 1) / 1000;
const rand = () => Math.random();
const sampleBefore = (now) => {
	const startYear = 2007;
	const endYear = new Date(now * 1000).getUTCFullYear();
	const year = startYear + Math.floor(rand() * (endYear - startYear + 1));
	const lo = Date.UTC(year, 0, 1) / 1000;
	const hi = Math.min(now, Date.UTC(year + 1, 0, 1) / 1000 - 1);
	return Math.floor(lo + rand() * (hi - lo));
};
let streamPos = 0; // 単調採番カウンタ(全ページ通し)

const fetchRandomDonor = async (h) => {
	const fRes = await origFetch('https://www.tumblr.com/api/v2/user/following?limit=20', { headers: h });
	const blogs = (await fRes.json())?.response?.blogs || [];
	if (!blogs.length) return [];
	const now = Math.floor(Date.now() / 1000);
	const out = [];
	for (let tries = 0; tries < 8 && out.length < 8; tries++) {
		const blog = blogs[Math.floor(rand() * blogs.length)];
		const before = sampleBefore(now);
		const pRes = await origFetch(
			`https://www.tumblr.com/api/v2/blog/${blog.name}/posts?npf=true&limit=3&before=${before}`,
			{ headers: h },
		);
		const posts = (await pRes.json().catch(() => null))?.response?.posts || [];
		out.push(...posts);
	}
	return out.map(deepCamel).map((p) => ({ ...p, streamGlobalPosition: streamPos++ }));
};
```

STAGE 分岐(`STAGE === 3 || STAGE === 4` の後)に:

```javascript
			if (STAGE === 5) {
				if (!capturedAuth) {
					log('stage 5: no auth yet — passthrough');
					return res;
				}
				const donor = await fetchRandomDonor({ Authorization: capturedAuth });
				if (!donor.length) {
					log('stage 5: donor empty — passthrough');
					return res;
				}
				body.response.timeline.elements = donor; // _links は温存
				log('stage 5: replaced with', donor.length, 'random posts, streamPos now', streamPos);
				return jsonResponse(body);
			}
```

- [ ] **Step 2: 実機で go/no-go**

Tampermonkey を v0.5 に更新 → `localStorage.setItem('esSpikeStage','5')` → dashboard リロード → 繰り返しスクロール。判定:
- **PASS**: スクロールのたびに新しいランダム過去ポストが積み増され、無限ローディング・重複ループが起きない。
- **FAIL**: 無限ローディング / 同じポストのループ / append されない。→ 封筒設計を見直す(`_links.next` を自前カーソルに差し替え、`streamSessionId` の扱い、要素の必須メタを再調査)。FAIL の内容を記録してから Step 3。

- [ ] **Step 3: 結果を spike レポートに追記しコミット**

`docs/superpowers/specs/2026-07-21-userscript-spike-report.md` に Stage 5 の結果(PASS/FAIL と、封筒に最低限必要だったフィールド)を追記。

```bash
git add spike/05-spike.user.js docs/superpowers/specs/2026-07-21-userscript-spike-report.md
git commit -m "Add stage 5 live pagination-continuity gate result"
```

**このゲートが FAIL なら、以降のタスクに進む前に「完全置換 UX」を再設計する(先頭数件のみ差し込む混在モード等)。PASS 前提で Task 2 以降へ。**

---

### Task 2: `src/core/sampling.ts` へ移動

**Files:**
- Create: `src/core/sampling.ts`(内容は `src/worker/sampling.ts` と同一)
- Create: `src/core/sampling.test.ts`(内容は `src/worker/sampling.test.ts` を移設)
- Delete: `src/worker/sampling.ts`, `src/worker/sampling.test.ts`
- Modify: `src/worker/feed.ts`(import 元を `../core/sampling` に)

**Interfaces:**
- Produces: `export const TUMBLR_EPOCH: number`, `export type Rng = () => number`, `export function sampleTimestamp(notBefore: number, now: number, rng: Rng): number`

- [ ] **Step 1: 移動**

`src/worker/sampling.ts` を `src/core/sampling.ts` に、`src/worker/sampling.test.ts` を `src/core/sampling.test.ts` に中身そのまま移す(`git mv` 相当)。テストの import は同ディレクトリ相対なので変更不要。

- [ ] **Step 2: 参照元を更新**

`src/worker/feed.ts:2` の `import { type Rng, sampleTimestamp, TUMBLR_EPOCH } from "./sampling";` を `from "../core/sampling";` に変更。他に `./sampling` を参照するファイルがあれば同様に(`grep -rn "sampling" src` で確認)。

- [ ] **Step 3: テスト緑を確認**

Run: `pnpm exec vitest run src/core/sampling.test.ts && pnpm exec vitest run src/worker/feed.test.ts`
Expected: 両方 PASS。

- [ ] **Step 4: コミット**

```bash
git add -A src/core/sampling.ts src/core/sampling.test.ts src/worker/feed.ts
git rm src/worker/sampling.ts src/worker/sampling.test.ts 2>/dev/null; git add -A
git commit -m "Move sampling logic to src/core"
```

---

### Task 3: `src/core/transform.ts`(snake→camel 深変換)

**Files:**
- Create: `src/core/transform.ts`
- Create: `src/core/transform.test.ts`

**Interfaces:**
- Produces: `export function toCamel(s: string): string`, `export function deepCamel<T = unknown>(value: unknown): T`

- [ ] **Step 1: 失敗するテストを書く**

```typescript
import { describe, expect, it } from "vitest";
import { deepCamel, toCamel } from "./transform";

describe("toCamel", () => {
  it("snake_case を camelCase に変換する", () => {
    expect(toCamel("blog_name")).toBe("blogName");
  });

  it("連続アンダースコアや数字も扱う", () => {
    expect(toCamel("stream_global_position")).toBe("streamGlobalPosition");
    expect(toCamel("tags_v2")).toBe("tagsV2");
  });

  it("既に camelCase ならそのまま", () => {
    expect(toCamel("objectType")).toBe("objectType");
  });
});

describe("deepCamel", () => {
  it("ネストしたオブジェクトのキーを再帰変換する", () => {
    expect(
      deepCamel({ blog_name: "x", trail: [{ reblog_key: "rk" }] }),
    ).toEqual({ blogName: "x", trail: [{ reblogKey: "rk" }] });
  });

  it("配列・プリミティブ値はキー変換の対象外(値は保持)", () => {
    expect(deepCamel({ tags: ["a_b", "c"] })).toEqual({ tags: ["a_b", "c"] });
  });

  it("null を保持する", () => {
    expect(deepCamel({ recommended_color: null })).toEqual({
      recommendedColor: null,
    });
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `pnpm exec vitest run src/core/transform.test.ts`
Expected: FAIL(モジュール未定義)。

- [ ] **Step 3: 最小実装**

```typescript
export function toCamel(s: string): string {
  return s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

export function deepCamel<T = unknown>(value: unknown): T {
  if (Array.isArray(value)) return value.map((v) => deepCamel(v)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[toCamel(k)] = deepCamel(v);
    return out as T;
  }
  return value as T;
}
```

- [ ] **Step 4: 緑を確認**

Run: `pnpm exec vitest run src/core/transform.test.ts`
Expected: PASS。

- [ ] **Step 5: コミット**

```bash
git add src/core/transform.ts src/core/transform.test.ts
git commit -m "Add snake_case to camelCase deep transform in core"
```

---

### Task 4: `src/core/feed-sampling.ts`(`sampleFeed` 抽出)

`buildFeed` のオーケストレーション(フォロー取得キャッシュ・ランダムブログ選択・`before=` サンプリング・最古境界学習・shuffle)を、`KVNamespace` 依存を `Storage` 抽象に置き換えて core へ抽出する。`RawPost[]` を返し、正規化(`normalizePost`)は各呼び出し側に委ねる。**rng の呼び出し順序を既存 `buildFeed` と完全一致させる**(feed.test.ts のシード済みテストを壊さないため、コードは機械的に移送する)。

**Files:**
- Create: `src/core/feed-sampling.ts`
- Create: `src/core/feed-sampling.test.ts`

**Interfaces:**
- Consumes: `src/core/sampling` の `sampleTimestamp`, `TUMBLR_EPOCH`, `Rng`
- Produces:
  ```typescript
  export type RawPost = Record<string, unknown>;
  export type FollowingBlog = { name: string };
  export type FeedClient = {
    following(): Promise<FollowingBlog[]>;
    posts(blogName: string, before: number, limit: number): Promise<RawPost[]>;
  };
  export type Storage = {
    getJSON<T>(key: string): Promise<T | null>;
    putJSON(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  };
  export type SampleFeedOptions = {
    client: FeedClient;
    storage: Storage;
    userName: string;
    rng: Rng;
    now: number;
    samplesPerBatch: number;
    postsPerSample: number;
    followingTtl: number;
    isFatal?: (err: unknown) => boolean;
  };
  export function sampleFeed(opts: SampleFeedOptions): Promise<RawPost[]>;
  ```

- [ ] **Step 1: 失敗するテストを書く**

```typescript
import { describe, expect, it } from "vitest";
import { type FeedClient, sampleFeed, type Storage } from "./feed-sampling";

function memStorage(): Storage {
  const m = new Map<string, unknown>();
  return {
    getJSON: async <T>(k: string) => (m.has(k) ? (m.get(k) as T) : null),
    putJSON: async (k, v) => void m.set(k, v),
  };
}

const seq = (values: number[]): (() => number) => {
  let i = 0;
  return () => values[i++ % values.length];
};

const client = (posts: Record<string, unknown>[]): FeedClient => ({
  following: async () => [{ name: "a" }, { name: "b" }, { name: "c" }],
  posts: async () => posts,
});

describe("sampleFeed", () => {
  it("フォローが空なら空配列を返す", async () => {
    const empty: FeedClient = { following: async () => [], posts: async () => [] };
    const got = await sampleFeed({
      client: empty, storage: memStorage(), userName: "me",
      rng: seq([0.1]), now: 1_700_000_000,
      samplesPerBatch: 4, postsPerSample: 2, followingTtl: 3600,
    });
    expect(got).toEqual([]);
  });

  it("取得した生ポストを(正規化せず)返す", async () => {
    const got = await sampleFeed({
      client: client([{ id_string: "1" }, { id_string: "2" }]),
      storage: memStorage(), userName: "me",
      rng: seq([0.1, 0.2, 0.3]), now: 1_700_000_000,
      samplesPerBatch: 1, postsPerSample: 2, followingTtl: 3600,
    });
    expect(got.map((p) => p.id_string).sort()).toEqual(["1", "2"]);
  });

  it("posts が空なら最古境界を storage に学習する", async () => {
    const storage = memStorage();
    await sampleFeed({
      client: { following: async () => [{ name: "a" }], posts: async () => [] },
      storage, userName: "me", rng: seq([0.5, 0.5]), now: 1_700_000_000,
      samplesPerBatch: 1, postsPerSample: 2, followingTtl: 3600,
    });
    expect(await storage.getJSON<number>("oldest:a")).toBeTypeOf("number");
  });

  it("isFatal に該当するエラーは即時 throw する", async () => {
    const fatal = new Error("rate limited");
    await expect(
      sampleFeed({
        client: { following: async () => [{ name: "a" }], posts: async () => { throw fatal; } },
        storage: memStorage(), userName: "me", rng: seq([0.5, 0.5]), now: 1_700_000_000,
        samplesPerBatch: 1, postsPerSample: 2, followingTtl: 3600,
        isFatal: (e) => e === fatal,
      }),
    ).rejects.toBe(fatal);
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `pnpm exec vitest run src/core/feed-sampling.test.ts`
Expected: FAIL。

- [ ] **Step 3: 実装(`buildFeed` から機械的に移送)**

```typescript
import { type Rng, sampleTimestamp, TUMBLR_EPOCH } from "./sampling";

export type RawPost = Record<string, unknown>;
export type FollowingBlog = { name: string };
export type FeedClient = {
  following(): Promise<FollowingBlog[]>;
  posts(blogName: string, before: number, limit: number): Promise<RawPost[]>;
};
export type Storage = {
  getJSON<T>(key: string): Promise<T | null>;
  putJSON(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
};
export type SampleFeedOptions = {
  client: FeedClient;
  storage: Storage;
  userName: string;
  rng: Rng;
  now: number;
  samplesPerBatch: number;
  postsPerSample: number;
  followingTtl: number;
  isFatal?: (err: unknown) => boolean;
};

function shuffle<T>(items: T[], rng: Rng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

async function cachedFollowing(
  o: SampleFeedOptions,
): Promise<FollowingBlog[]> {
  const key = `following:${o.userName}`;
  const cached = await o.storage.getJSON<FollowingBlog[]>(key);
  if (cached) return cached;
  const blogs = await o.client.following();
  await o.storage.putJSON(key, blogs, o.followingTtl);
  return blogs;
}

export async function sampleFeed(o: SampleFeedOptions): Promise<RawPost[]> {
  const following = await cachedFollowing(o);
  if (following.length === 0) return [];

  const samples = Array.from(
    { length: o.samplesPerBatch },
    () => following[Math.floor(o.rng() * following.length)],
  );

  const results = await Promise.all(
    samples.map(async (blog) => {
      const boundKey = `oldest:${blog.name}`;
      const notBefore =
        (await o.storage.getJSON<number>(boundKey)) ?? TUMBLR_EPOCH;
      const before = sampleTimestamp(notBefore, o.now, o.rng);
      try {
        const posts = await o.client.posts(blog.name, before, o.postsPerSample);
        if (posts.length === 0) {
          await o.storage.putJSON(boundKey, before);
          return { ok: true, posts: [] as RawPost[] };
        }
        return { ok: true, posts };
      } catch (err) {
        if (o.isFatal?.(err)) throw err;
        return { ok: false, posts: [] as RawPost[] };
      }
    }),
  );

  if (results.every((r) => !r.ok)) throw new Error("all feed samples failed");
  return shuffle(
    results.flatMap((r) => r.posts),
    o.rng,
  );
}
```

- [ ] **Step 4: 緑を確認**

Run: `pnpm exec vitest run src/core/feed-sampling.test.ts`
Expected: PASS。

- [ ] **Step 5: コミット**

```bash
git add src/core/feed-sampling.ts src/core/feed-sampling.test.ts
git commit -m "Extract generic sampleFeed orchestration into core"
```

---

### Task 5: worker の `buildFeed` を `sampleFeed` 上に載せ替え

worker を core 消費側にリファクタする(spec の「core を import する形にリファクタ」)。`buildFeed` の**シグネチャと外部挙動は不変**に保ち、`feed.test.ts` を無改変で緑に保つ。

**Files:**
- Modify: `src/worker/feed.ts`

**Interfaces:**
- Consumes: `src/core/feed-sampling` の `sampleFeed`, `Storage`, `FeedClient`, `RawPost`
- Produces: `buildFeed(client, kv, userName, rng, now): Promise<FeedPost[]>`(既存と同一)

- [ ] **Step 1: `feed.ts` を書き換え**

`deriveKind` / `normalizePost` はそのまま残す。`shuffle` / `cachedFollowing` / オーケストレーションは削除し、`sampleFeed` を呼ぶ。KV→`Storage` アダプタを追加。`RawPost` の import 元は core に統一(`./tumblr` の `RawPost` は残置でよいが、`feed.ts` 内では core の型を使う)。

```typescript
import type { FeedPost, NpfBlock, PostKind, TrailItem } from "../shared/types";
import {
  type FeedClient as CoreFeedClient,
  type RawPost,
  sampleFeed,
  type Storage,
} from "../core/feed-sampling";
import { TumblrRateLimitError } from "./tumblr";

export const SAMPLES_PER_BATCH = 4;
export const POSTS_PER_SAMPLE = 2;
export const FOLLOWING_TTL = 3600;

export type FeedClient = CoreFeedClient;

export function deriveKind(blocks: NpfBlock[]): PostKind {
  const types = new Set(blocks.map((b) => b.type));
  if (types.has("video")) return "video";
  if (types.has("audio")) return "audio";
  if (types.has("image")) return "image";
  if (types.has("link")) return "link";
  return "text";
}

type RawTrailItem = { blog?: { name?: string }; content?: NpfBlock[] };

export function normalizePost(raw: RawPost): FeedPost {
  const content = (raw.content ?? []) as NpfBlock[];
  const trail: TrailItem[] = ((raw.trail ?? []) as RawTrailItem[]).map((t) => ({
    blogName: t.blog?.name ?? "",
    content: t.content ?? [],
  }));
  return {
    id: String(raw.id_string),
    blogName: String(raw.blog_name),
    postUrl: String(raw.post_url),
    timestamp: Number(raw.timestamp),
    tags: (raw.tags ?? []) as string[],
    reblogKey: String(raw.reblog_key),
    liked: Boolean(raw.liked),
    kind: deriveKind([...content, ...trail.flatMap((t) => t.content)]),
    content,
    trail,
  };
}

function kvStorage(kv: KVNamespace): Storage {
  return {
    getJSON: <T>(key: string) => kv.get(key, "json") as Promise<T | null>,
    putJSON: (key, value, ttlSeconds) =>
      kv.put(
        key,
        JSON.stringify(value),
        ttlSeconds ? { expirationTtl: ttlSeconds } : undefined,
      ),
  };
}

export async function buildFeed(
  client: FeedClient,
  kv: KVNamespace,
  userName: string,
  rng: () => number,
  now: number,
): Promise<FeedPost[]> {
  const raw = await sampleFeed({
    client,
    storage: kvStorage(kv),
    userName,
    rng,
    now,
    samplesPerBatch: SAMPLES_PER_BATCH,
    postsPerSample: POSTS_PER_SAMPLE,
    followingTtl: FOLLOWING_TTL,
    isFatal: (err) => err instanceof TumblrRateLimitError,
  });
  return raw.map(normalizePost);
}
```

- [ ] **Step 2: 既存テスト緑を確認**

Run: `pnpm exec vitest run src/worker/feed.test.ts`
Expected: PASS(無改変)。もし `shuffle` の rng 順序差で落ちたら、`sampleFeed` 内の順序が旧 `buildFeed` と一致しているか照合して直す。

- [ ] **Step 3: 全体テストと lint**

Run: `pnpm exec vitest run && pnpm exec biome check .`
Expected: 全 PASS。

- [ ] **Step 4: コミット**

```bash
git add src/worker/feed.ts
git commit -m "Rebuild worker buildFeed on top of core sampleFeed"
```

---

### Task 6: `src/userscript/internal-client.ts`(内部 API クライアント)

**Files:**
- Create: `src/userscript/internal-client.ts`
- Create: `src/userscript/internal-client.test.ts`
- Create: `src/userscript/fixtures/following.json`(サニタイズ済み最小 fixture)
- Create: `src/userscript/fixtures/posts.json`(サニタイズ済み最小 fixture)

**Interfaces:**
- Consumes: `src/core/feed-sampling` の `FeedClient`, `RawPost`, `FollowingBlog`
- Produces: `export function createInternalClient(deps: { getAuth: () => string | null; fetchFn: typeof fetch }): FeedClient`

- [ ] **Step 1: fixture を用意**

`following.json`: `{"response":{"total_blogs":2,"blogs":[{"name":"alpha"},{"name":"beta"}]}}`
`posts.json`: `{"response":{"posts":[{"id_string":"1","blog_name":"alpha","before":true}]}}`（実データをサニタイズして最小化。個人情報・トークンは除去）

- [ ] **Step 2: 失敗するテストを書く**

```typescript
import { describe, expect, it, vi } from "vitest";
import { createInternalClient } from "./internal-client";
import following from "./fixtures/following.json";
import posts from "./fixtures/posts.json";

const jsonRes = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200 });

describe("createInternalClient", () => {
  it("following を internal API から取得し blogs を返す", async () => {
    const fetchFn = vi.fn(async () => jsonRes(following));
    const client = createInternalClient({ getAuth: () => "tok", fetchFn });
    expect(await client.following()).toEqual([{ name: "alpha" }, { name: "beta" }]);
  });

  it("posts を before/limit 付きで取得する", async () => {
    const fetchFn = vi.fn(async () => jsonRes(posts));
    const client = createInternalClient({ getAuth: () => "tok", fetchFn });
    const got = await client.posts("alpha", 1_420_070_400, 3);
    expect(got[0].id_string).toBe("1");
    const url = String(fetchFn.mock.calls[0][0]);
    expect(url).toContain("/api/v2/blog/alpha/posts");
    expect(url).toContain("before=1420070400");
    expect(url).toContain("limit=3");
  });

  it("Authorization ヘッダーに getAuth() の値を付ける", async () => {
    const fetchFn = vi.fn(async () => jsonRes(posts));
    const client = createInternalClient({ getAuth: () => "abc", fetchFn });
    await client.posts("alpha", 1, 1);
    const init = fetchFn.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).get("Authorization")).toBe("abc");
  });

  it("getAuth() が null なら例外", async () => {
    const client = createInternalClient({ getAuth: () => null, fetchFn: vi.fn() });
    await expect(client.posts("a", 1, 1)).rejects.toThrow();
  });
});
```

- [ ] **Step 3: 失敗を確認**

Run: `pnpm exec vitest run src/userscript/internal-client.test.ts`
Expected: FAIL。

- [ ] **Step 4: 実装**

```typescript
import type {
  FeedClient,
  FollowingBlog,
  RawPost,
} from "../core/feed-sampling";

const BASE = "https://www.tumblr.com/api/v2";

export function createInternalClient(deps: {
  getAuth: () => string | null;
  fetchFn: typeof fetch;
}): FeedClient {
  const get = async <T>(path: string): Promise<T> => {
    const auth = deps.getAuth();
    if (!auth) throw new Error("no captured auth token");
    const res = await deps.fetchFn(`${BASE}${path}`, {
      headers: { Authorization: auth },
    });
    if (!res.ok) throw new Error(`internal api ${res.status}`);
    const body = (await res.json()) as { response: T };
    return body.response;
  };

  return {
    following: async (): Promise<FollowingBlog[]> => {
      const limit = 20;
      const maxPages = 50;
      const first = await get<{ total_blogs: number; blogs: FollowingBlog[] }>(
        `/user/following?limit=${limit}&offset=0`,
      );
      const pages: FollowingBlog[][] = [first.blogs];
      const remaining = first.total_blogs - first.blogs.length;
      if (first.blogs.length > 0 && remaining > 0) {
        const extra = Math.min(Math.ceil(remaining / limit), maxPages - 1);
        const rest = await Promise.all(
          Array.from({ length: extra }, (_, i) =>
            get<{ blogs: FollowingBlog[] }>(
              `/user/following?limit=${limit}&offset=${(i + 1) * limit}`,
            ),
          ),
        );
        for (const r of rest) pages.push(r.blogs);
      }
      return pages.flat();
    },
    posts: async (
      blogName: string,
      before: number,
      limit: number,
    ): Promise<RawPost[]> => {
      const res = await get<{ posts: RawPost[] }>(
        `/blog/${encodeURIComponent(blogName)}/posts?npf=true&limit=${limit}&before=${before}`,
      );
      return res.posts;
    },
  };
}
```

- [ ] **Step 5: 緑を確認**

Run: `pnpm exec vitest run src/userscript/internal-client.test.ts`
Expected: PASS。tsconfig に `resolveJsonModule` が無ければ有効化(下記 Step 6)。

- [ ] **Step 6: JSON import 設定を確認**

`tsconfig.json` の `compilerOptions` に `"resolveJsonModule": true` が無ければ追加。vitest は既定で JSON を読める。

- [ ] **Step 7: コミット**

```bash
git add src/userscript/internal-client.ts src/userscript/internal-client.test.ts src/userscript/fixtures/ tsconfig.json
git commit -m "Add internal Tumblr API client for the userscript"
```

---

### Task 7: `src/userscript/timeline-page.ts`(自前ページング封筒)

Task 1(Stage 5)で PASS した封筒仕様を、テスト可能な構造不変条件として実装する。**受理性の最終確認は Task 10 のライブ E2E**。

**Files:**
- Create: `src/userscript/timeline-page.ts`
- Create: `src/userscript/timeline-page.test.ts`

**Interfaces:**
- Consumes: `src/core/feed-sampling` の `RawPost`(camel 化後の要素は `Record<string, unknown>`)
- Produces:
  ```typescript
  export type DashboardBody = {
    response: { timeline: { elements: unknown[]; _links?: unknown } };
  };
  export function createPager(): {
    buildPage(original: DashboardBody, elements: Record<string, unknown>[]): DashboardBody;
  };
  ```

- [ ] **Step 1: 失敗するテストを書く**(構造不変条件)

```typescript
import { describe, expect, it } from "vitest";
import { createPager } from "./timeline-page";

const body = () => ({
  response: { timeline: { elements: [{ objectType: "post", id: "orig" }], _links: { next: { href: "/x" } } } },
});

describe("createPager", () => {
  it("elements を渡した要素で置換する", () => {
    const pager = createPager();
    const out = pager.buildPage(body(), [{ id: "a" }, { id: "b" }]);
    expect(out.response.timeline.elements.map((e: any) => e.id)).toEqual(["a", "b"]);
  });

  it("streamGlobalPosition をページ跨ぎで単調増加させる", () => {
    const pager = createPager();
    const p1 = pager.buildPage(body(), [{ id: "a" }, { id: "b" }]);
    const p2 = pager.buildPage(body(), [{ id: "c" }]);
    const pos = [...p1.response.timeline.elements, ...p2.response.timeline.elements].map(
      (e: any) => e.streamGlobalPosition,
    );
    expect(pos).toEqual([0, 1, 2]);
  });

  it("_links.next を温存してスクロール継続を保証する", () => {
    const pager = createPager();
    const out = pager.buildPage(body(), [{ id: "a" }]);
    expect(out.response.timeline._links).toBeTruthy();
  });

  it("元 body を破壊的変更しない", () => {
    const pager = createPager();
    const src = body();
    pager.buildPage(src, [{ id: "a" }]);
    expect((src.response.timeline.elements[0] as any).id).toBe("orig");
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `pnpm exec vitest run src/userscript/timeline-page.test.ts`
Expected: FAIL。

- [ ] **Step 3: 実装**

```typescript
export type DashboardBody = {
  response: { timeline: { elements: unknown[]; _links?: unknown } };
};

export function createPager() {
  let streamPos = 0;
  return {
    buildPage(
      original: DashboardBody,
      elements: Record<string, unknown>[],
    ): DashboardBody {
      const positioned = elements.map((el) => ({
        ...el,
        streamGlobalPosition: streamPos++,
      }));
      return {
        ...original,
        response: {
          ...original.response,
          timeline: {
            ...original.response.timeline,
            elements: positioned,
            // _links.next は温存(スクローラーが次ページを要求し続ける)
          },
        },
      };
    },
  };
}
```

- [ ] **Step 4: 緑を確認**

Run: `pnpm exec vitest run src/userscript/timeline-page.test.ts`
Expected: PASS。

- [ ] **Step 5: コミット**

```bash
git add src/userscript/timeline-page.ts src/userscript/timeline-page.test.ts
git commit -m "Add self-paginating timeline envelope generator"
```

---

### Task 8: `src/userscript/storage.ts`(GM / localStorage、TTL 付き)

**Files:**
- Create: `src/userscript/storage.ts`
- Create: `src/userscript/storage.test.ts`

**Interfaces:**
- Consumes: `src/core/feed-sampling` の `Storage`
- Produces: `export function createStorage(deps?: { now?: () => number }): Storage`（GM 関数があれば使用、無ければ `localStorage`)

- [ ] **Step 1: 失敗するテストを書く**(jsdom の localStorage を使用)

```typescript
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createStorage } from "./storage";

describe("createStorage (localStorage)", () => {
  beforeEach(() => localStorage.clear());

  it("put した値を get で読み戻せる", async () => {
    const s = createStorage();
    await s.putJSON("k", { a: 1 });
    expect(await s.getJSON<{ a: number }>("k")).toEqual({ a: 1 });
  });

  it("未設定キーは null", async () => {
    expect(await createStorage().getJSON("missing")).toBeNull();
  });

  it("TTL 経過後は null を返す", async () => {
    let t = 1000;
    const s = createStorage({ now: () => t });
    await s.putJSON("k", "v", 10); // expires at 1010s
    t = 1_000_000;
    expect(await s.getJSON("k")).toBeNull();
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `pnpm exec vitest run src/userscript/storage.test.ts`
Expected: FAIL。

- [ ] **Step 3: 実装**

```typescript
import type { Storage } from "../core/feed-sampling";

type Entry = { v: unknown; exp: number | null };

declare const GM_getValue: ((k: string, d?: string) => string) | undefined;
declare const GM_setValue: ((k: string, v: string) => void) | undefined;

export function createStorage(deps?: { now?: () => number }): Storage {
  const now = deps?.now ?? (() => Math.floor(Date.now() / 1000));
  const hasGM =
    typeof GM_getValue === "function" && typeof GM_setValue === "function";
  const readRaw = (k: string): string | null =>
    hasGM ? (GM_getValue?.(k, "") || null) : localStorage.getItem(k);
  const writeRaw = (k: string, v: string): void => {
    if (hasGM) GM_setValue?.(k, v);
    else localStorage.setItem(k, v);
  };

  return {
    getJSON: async <T>(key: string): Promise<T | null> => {
      const raw = readRaw(`ees:${key}`);
      if (!raw) return null;
      const entry = JSON.parse(raw) as Entry;
      if (entry.exp !== null && entry.exp < now()) return null;
      return entry.v as T;
    },
    putJSON: async (key, value, ttlSeconds) => {
      const entry: Entry = {
        v: value,
        exp: ttlSeconds ? now() + ttlSeconds : null,
      };
      writeRaw(`ees:${key}`, JSON.stringify(entry));
    },
  };
}
```

- [ ] **Step 4: 緑を確認**

Run: `pnpm exec vitest run src/userscript/storage.test.ts`
Expected: PASS。

- [ ] **Step 5: コミット**

```bash
git add src/userscript/storage.ts src/userscript/storage.test.ts
git commit -m "Add GM/localStorage storage adapter with TTL"
```

---

### Task 9: `src/userscript/hook.ts` と `main.ts`(fetch 介入・トークン捕獲・トグル)

ここは大半がブラウザ結合でユニットテスト困難。トークン捕獲と「介入判定+フォールバック」の純粋部分だけ切り出してテストし、残りは Task 10 のライブ E2E で確認する。

**Files:**
- Create: `src/userscript/hook.ts`
- Create: `src/userscript/hook.test.ts`
- Create: `src/userscript/main.ts`

**Interfaces:**
- Consumes: `createInternalClient`, `createStorage`, `createPager`, `sampleFeed`, `deepCamel`
- Produces:
  ```typescript
  // hook.ts
  export function extractAuth(input: RequestInfo | URL, init?: RequestInit): string | null;
  export function isDashboardUrl(url: string): boolean;
  export function installHook(deps: {
    win: { fetch: typeof fetch };
    getEnabled: () => boolean;
    buildElements: (original: unknown) => Promise<Record<string, unknown>[] | null>;
    onAuth: (token: string) => void;
    pager: ReturnType<typeof import("./timeline-page").createPager>;
  }): void;
  ```

- [ ] **Step 1: 純粋部分の失敗テストを書く**

```typescript
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { extractAuth, isDashboardUrl } from "./hook";

describe("extractAuth", () => {
  it("init.headers の Authorization を返す", () => {
    expect(extractAuth("/api/v2/x", { headers: { Authorization: "Bearer z" } })).toBe("Bearer z");
  });
  it("Request オブジェクトのヘッダーからも取れる", () => {
    const req = new Request("https://www.tumblr.com/api/v2/x", { headers: { Authorization: "Bearer q" } });
    expect(extractAuth(req)).toBe("Bearer q");
  });
  it("Authorization が無ければ null", () => {
    expect(extractAuth("/api/v2/x", {})).toBeNull();
  });
});

describe("isDashboardUrl", () => {
  it("dashboard タイムラインを判定する", () => {
    expect(isDashboardUrl("https://www.tumblr.com/api/v2/timeline/dashboard?x=1")).toBe(true);
    expect(isDashboardUrl("https://www.tumblr.com/api/v2/user/following")).toBe(false);
  });
});
```

- [ ] **Step 2: 失敗を確認 → 実装**

Run: `pnpm exec vitest run src/userscript/hook.test.ts` → FAIL を確認。

`hook.ts`:

```typescript
import type { createPager } from "./timeline-page";

export function extractAuth(
  input: RequestInfo | URL,
  init?: RequestInit,
): string | null {
  const headers =
    input instanceof Request
      ? input.headers
      : new Headers(init?.headers ?? {});
  return headers.get("Authorization");
}

export function isDashboardUrl(url: string): boolean {
  return url.includes("/api/v2/timeline/dashboard");
}

export function installHook(deps: {
  win: { fetch: typeof fetch };
  getEnabled: () => boolean;
  buildElements: (original: unknown) => Promise<Record<string, unknown>[] | null>;
  onAuth: (token: string) => void;
  pager: ReturnType<typeof createPager>;
}): void {
  const orig = deps.win.fetch.bind(deps.win);
  deps.win.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : (input as Request).url ?? String(input);
    // トークンは毎回の /api/v2/ 認証リクエストで捕獲を更新(ローテーション対策)
    if (url.includes("/api/v2/")) {
      const token = extractAuth(input, init);
      if (token) deps.onAuth(token);
    }
    const res = await orig(input, init);
    if (!deps.getEnabled() || !isDashboardUrl(url)) return res;
    try {
      const body = await res.clone().json();
      const elements = await deps.buildElements(body);
      if (!elements || elements.length === 0) return res;
      const paged = deps.pager.buildPage(body, elements);
      return new Response(JSON.stringify(paged), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (e) {
      console.warn("[ees] replace failed — passthrough:", e);
      return res;
    }
  };
}
```

Run: `pnpm exec vitest run src/userscript/hook.test.ts` → PASS を確認。

- [ ] **Step 3: `main.ts`(結線・トグル)を実装**

```typescript
import { deepCamel } from "../core/transform";
import { sampleFeed } from "../core/feed-sampling";
import { createInternalClient } from "./internal-client";
import { createStorage } from "./storage";
import { createPager } from "./timeline-page";
import { installHook } from "./hook";

declare const GM_registerMenuCommand: ((label: string, fn: () => void) => void) | undefined;

(() => {
  const w = window as unknown as { fetch: typeof fetch };
  let token: string | null = null;
  let enabled = true; // 既定 ON。トグルで反転
  const storage = createStorage();
  const pager = createPager();
  const client = createInternalClient({
    getAuth: () => token,
    fetchFn: (i, ini) => fetch(i, ini),
  });

  const buildElements = async (original: unknown) => {
    // userName は必須。/api/v2/user/info から一度だけ取得してキャッシュしてもよいが、
    // sampleFeed の following キャッシュキーに使うだけなので固定文字列で十分。
    const raw = await sampleFeed({
      client,
      storage,
      userName: "me",
      rng: Math.random,
      now: Math.floor(Date.now() / 1000),
      samplesPerBatch: 6,
      postsPerSample: 3,
      followingTtl: 3600,
    });
    if (raw.length === 0) return null;
    return raw.map((p) => deepCamel<Record<string, unknown>>(p));
  };

  installHook({
    win: w,
    getEnabled: () => enabled,
    buildElements,
    onAuth: (t) => {
      token = t;
    },
    pager,
  });

  GM_registerMenuCommand?.(
    "endless-endless-summer: toggle",
    () => {
      enabled = !enabled;
      console.log("[ees] enabled:", enabled);
    },
  );
  console.log("[ees] installed at document_start");
})();
```

- [ ] **Step 4: 全テスト + lint**

Run: `pnpm exec vitest run && pnpm exec biome check .`
Expected: 全 PASS。

- [ ] **Step 5: コミット**

```bash
git add src/userscript/hook.ts src/userscript/hook.test.ts src/userscript/main.ts
git commit -m "Add fetch hook, token capture, and userscript entry"
```

---

### Task 10: esbuild ビルド + Tampermonkey ヘッダー、ライブ E2E

**Files:**
- Create: `build/userscript.mjs`
- Modify: `package.json`(`build:userscript` スクリプト追加)

**Interfaces:**
- Consumes: `src/userscript/main.ts`
- Produces: `dist/endless-endless-summer.user.js`(Tampermonkey ヘッダー付き単一ファイル)

- [ ] **Step 1: ビルドスクリプトを書く**

```javascript
// build/userscript.mjs
import { build } from "esbuild";

const banner = `// ==UserScript==
// @name         endless-endless-summer
// @namespace    dlwr
// @match        https://www.tumblr.com/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @version      1.0.0
// @description  Tumblr dashboard を年均等ランダムな過去ポストに置き換える
// ==/UserScript==`;

await build({
  entryPoints: ["src/userscript/main.ts"],
  bundle: true,
  format: "iife",
  target: "es2022",
  banner: { js: banner },
  outfile: "dist/endless-endless-summer.user.js",
  legalComments: "none",
});
console.log("built dist/endless-endless-summer.user.js");
```

- [ ] **Step 2: `package.json` にスクリプト追加**

`"scripts"` に `"build:userscript": "node build/userscript.mjs"` を追加。

- [ ] **Step 3: ビルド実行**

Run: `pnpm build:userscript`
Expected: `dist/endless-endless-summer.user.js` が生成され、先頭に UserScript ヘッダーがある。`head -15 dist/endless-endless-summer.user.js` で確認。

- [ ] **Step 4: ライブ E2E(実機)**

Tampermonkey に `dist/endless-endless-summer.user.js` をインストール → tumblr.com/dashboard を開く。確認:
1. スクロールで**毎回新しいランダム過去ポスト**が積まれ、無限ローディング・重複ループが起きない(Task 1 の再確認)。
2. **J/K ナビ・T リブログ・L ライク**がネイティブに動く。
3. GM メニューの toggle で置換 ON/OFF が切り替わる。
4. ネットワーク断や API エラーで**素のダッシュボードにフォールバック**し壊れない(`token` 未捕獲時は `buildElements` が following で失敗 → passthrough)。

問題があれば `console`(`[ees]`)を確認して原因タスクに戻る。E2E で使ったリブログは削除。

- [ ] **Step 5: コミット**

```bash
git add build/userscript.mjs package.json
git commit -m "Add esbuild userscript build"
```

---

### Task 11(任意・劣化許容): 初回画面の置換

初回表示分はサーバー埋め込み(`___INITIAL_STATE___`)で fetch 非経由の可能性。v1 は「初回は素、スクロールから置換」で許容可。**難しければこのタスクは省略してよい**(Global Constraints のフォールバック方針)。

**Files:**
- Modify: `src/userscript/main.ts`

**Interfaces:**
- Consumes: 既存フック
- Produces: 起動直後の再取得誘発、または埋め込み state 書き換え

- [ ] **Step 1: 実挙動を再観察**(Stage 1 と Stage 4 の観察が矛盾していたため、まず事実確認)

Tampermonkey インストール状態で dashboard をハードリロードし、**初回表示が置換済みか素か**を確認。素なら以下いずれかを実装。

- [ ] **Step 2A: 再取得誘発**(軽い方を先に試す)

起動直後に history/SPA ナビゲーションで dashboard を再取得させる(例: 別ルートへ push → 即 dashboard へ戻す)。フックが初回 fetch を捉えられれば初回から置換される。

- [ ] **Step 2B: 埋め込み state 書き換え**(2A で不足なら)

`___INITIAL_STATE___` 内の dashboard timeline elements を、起動時に取得した camel 化ポストで差し替える。形状は fetch 版と同一。

- [ ] **Step 3: 実機確認 → コミット**

```bash
git add src/userscript/main.ts
git commit -m "Replace embedded first-screen timeline"
```

---

### Task 12: 配布(README + Release)

**Files:**
- Create/Modify: `README.md`(インストール手順)

- [ ] **Step 1: README にインストール手順を書く**

Tampermonkey 前提、`dist/endless-endless-summer.user.js` のインストール方法、トグル、既知の制限(ブックマークレット非対応の理由、初回画面挙動)、プライバシー(トークンはローカルのみ・保存しない)を記載。

- [ ] **Step 2: コミット**

```bash
git add README.md
git commit -m "Document userscript installation"
```

- [ ] **Step 3(手動)**: GitHub Releases に `.user.js` を添付(ユーザー作業)。必要なら Greasy Fork 公開を検討。

## Self-Review

- **spec 網羅**: セッション相乗り(Task 6)/ fetch 介入(Task 9)/ camel 変換(Task 3)/ 自前ページング(Task 1・7)/ captured token 毎回捕獲(Task 9)/ 初回画面(Task 11)/ core 切り出し・worker リファクタ(Task 2/4/5)/ 配布(Task 12)/ ネイティブキーボード(Task 10 で確認)。
- **プレースホルダ無し**: 各テスト・実装は完全なコード。
- **型整合**: `FeedClient`/`Storage`/`RawPost` は core で定義し、internal-client(Task 6)・storage(Task 8)・worker(Task 5)が同一シグネチャで実装。`sampleFeed` の `SampleFeedOptions` は Task 4 定義を Task 5・9 が使用。
- **ゲート順序**: 未実証の pagination 連続性(Task 1)を先頭に、リスクのある worker リファクタ(Task 5)と劣化許容の初回画面(Task 11)を後段に配置。
- **follow-up 明記**: 非ネイティブ独自キー・設定 UI・タイプフィルタは別プラン。
