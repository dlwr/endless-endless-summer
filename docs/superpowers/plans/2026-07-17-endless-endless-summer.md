# endless-endless-summer 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** フォロー中ブログの過去ポストを年均等ランダムサンプリングで無限に流す、キーボード駆動の Tumblr ダッシュボード代替 Web アプリを作る。

**Architecture:** Cloudflare Workers 上に Hono の API(OAuth2 認証・フィード生成・リブログ/like プロキシ)を置き、同じ Worker から React + Vite の SPA を静的アセットとして配信する。トークンとキャッシュは KV に保存。ランダム抽出は Tumblr API の `before` パラメータに「2007〜現在からランダムに選んだ年内のランダム時刻」を渡すオンデマンド方式。

**Tech Stack:** TypeScript / Hono / React 19 / Vite + @cloudflare/vite-plugin / Cloudflare Workers + KV / Tumblr API v2 (OAuth2) / pnpm / Biome / Vitest + Testing Library

## Global Constraints

- パッケージマネージャは **pnpm**。lint/format は **Biome**。テストは **Vitest**。
- **TDD 必須**(t_wada 式 Red → Green → Refactor)。実装コードより先に失敗するテストを書く。
- 1 つの `it` では **1 つの振る舞いのみ**テストする。順序を検証するテストはデータ **3 件以上**。
- コミットは**意味単位で分割**(このプランのタスク境界がそのまま目安)。
- TypeScript は `strict: true`。
- UI コピーは英語ミニマル(例: "Log in with Tumblr")。
- キーボードショートカット正準表: `j`=次へ / `k`=前へ / `t`=即リブログ(プライマリブログへ) / `shift+t`=リブログダイアログ / `l`=like トグル / `o`=元ポストを新規タブ / `r`=フィード全リロール / `?`=ヘルプ。
- フィード定数: `SAMPLES_PER_BATCH = 6`、`POSTS_PER_SAMPLE = 2`、`FOLLOWING_TTL = 3600`(秒)。
- 重複排除はしない(同一ポストの再出現を許容する)。
- デザイントークン: 背景 `#001935`(navy)、カード `#ffffff`、アクセント `#00b8ff`、ポストカラム幅 `540px`(本家準拠)。
- Tumblr API のレスポンス形式はドキュメント(https://www.tumblr.com/docs/en/api/v2 と https://www.tumblr.com/docs/npf)が正。実装時に食い違いを見つけたらテストのフィクスチャを実物に合わせて直すこと。
- KV のキー設計: `session:{sid}` / `following:{userName}` / `oldest:{blogName}`(そのブログに「これ以前のポストは無い」と分かった下限タイムスタンプ)。

---

## ファイル構成(全体マップ)

```
endless-endless-summer/
├── index.html
├── package.json / pnpm-lock.yaml
├── wrangler.jsonc
├── vite.config.ts / vitest.config.ts / vitest.setup.ts
├── biome.json / tsconfig.json / .gitignore / .dev.vars(git管理外)
├── src/
│   ├── shared/
│   │   └── types.ts            # NPFブロック・FeedPost・Me 型(worker/app 共用)
│   ├── worker/
│   │   ├── index.ts            # Worker エントリ(default export)
│   │   ├── app.ts              # createApp(deps) — Hono 組み立て
│   │   ├── env.ts              # Env / AppEnv 型
│   │   ├── sampling.ts         # 年均等ランダムサンプリング(純粋関数)
│   │   ├── tumblr.ts           # OAuth2 トークン関数 + TumblrClient
│   │   ├── session.ts          # SessionStore(KV) + requireSession
│   │   ├── auth.ts             # /auth/login, /auth/callback, /auth/logout
│   │   ├── api.ts              # /api/me, /api/feed, /api/like, /api/reblog
│   │   ├── feed.ts             # buildFeed / normalizePost / deriveKind
│   │   └── test-helpers.ts     # FakeKV / fakeFetch / フィクスチャ
│   └── app/
│       ├── main.tsx / App.tsx
│       ├── api.ts              # fetch ラッパー
│       ├── settings.ts         # ポストタイプフィルタ(localStorage)
│       ├── shortcuts.ts        # resolveShortcut(純粋関数)
│       ├── hooks/useFeed.ts / hooks/useShortcuts.ts
│       ├── npf/format.ts       # applyFormatting(純粋関数)
│       ├── npf/NpfContent.tsx  # NPFブロックレンダラー
│       ├── components/LoginScreen.tsx / Feed.tsx / PostCard.tsx
│       │   / HelpOverlay.tsx / ReblogDialog.tsx / SettingsPanel.tsx / Toast.tsx
│       └── styles.css
└── docs/superpowers/plans/     # このファイル
```

---

### Task 1: プロジェクトスキャフォールド + /api/health

**Files:**
- Create: `package.json`, `wrangler.jsonc`, `vite.config.ts`, `vitest.config.ts`, `vitest.setup.ts`, `biome.json`, `tsconfig.json`, `.gitignore`, `index.html`, `src/worker/index.ts`, `src/worker/app.ts`, `src/worker/env.ts`, `src/app/main.tsx`, `src/app/App.tsx`, `src/app/styles.css`
- Test: `src/worker/app.test.ts`

**Interfaces:**
- Produces: `createApp(deps?: AppDeps): Hono<AppEnv>`(`src/worker/app.ts`)、`AppDeps = { fetchFn: typeof fetch }`、`Env = { KV: KVNamespace; TUMBLR_CLIENT_ID: string; TUMBLR_CLIENT_SECRET: string }`(`src/worker/env.ts`)。以降の全 worker タスクはこの `createApp` にルートを足していく。

- [ ] **Step 1: プロジェクト初期化**

```bash
cd /Users/yuta25/ghq/github.com/dlwr/endless-endless-summer
pnpm init
pnpm add hono react react-dom
pnpm add -D typescript vite @vitejs/plugin-react @cloudflare/vite-plugin wrangler \
  @cloudflare/workers-types vitest jsdom @testing-library/react @testing-library/jest-dom \
  @biomejs/biome @types/react @types/react-dom
```

- [ ] **Step 2: 設定ファイルを書く**

`package.json` の scripts(pnpm init 後に追記):

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "check": "biome check .",
    "format": "biome format --write ."
  }
}
```

`wrangler.jsonc`:

```jsonc
{
  "name": "endless-endless-summer",
  "main": "src/worker/index.ts",
  "compatibility_date": "2026-07-01",
  "assets": {
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*", "/auth/*"]
  },
  // id はローカル開発ではダミーで動く。Task 15 で `wrangler kv namespace create` の実IDに差し替える
  "kv_namespaces": [{ "binding": "KV", "id": "local-dev-placeholder" }],
  "observability": { "enabled": true }
}
```

`vite.config.ts`:

```ts
import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), cloudflare()],
});
```

`vitest.config.ts`(worker は node 環境、app は jsdom 環境):

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "worker",
          environment: "node",
          include: ["src/worker/**/*.test.ts", "src/shared/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "app",
          environment: "jsdom",
          include: ["src/app/**/*.test.ts", "src/app/**/*.test.tsx"],
          setupFiles: ["./vitest.setup.ts"],
        },
      },
    ],
  },
});
```

`vitest.setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";

// jsdom に無い IntersectionObserver のスタブ(無限スクロールのテスト用)
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
globalThis.IntersectionObserver ??=
  IntersectionObserverStub as unknown as typeof IntersectionObserver;
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "types": ["@cloudflare/workers-types", "vite/client"],
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src", "vitest.setup.ts"]
}
```

`biome.json`:

```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "formatter": { "enabled": true, "indentStyle": "space" },
  "linter": { "enabled": true, "rules": { "recommended": true } },
  "files": { "includes": ["src/**", "*.ts", "*.json", "index.html"] }
}
```

`.gitignore`:

```
node_modules/
dist/
.dev.vars
.wrangler/
```

- [ ] **Step 3: 失敗するテストを書く**

`src/worker/app.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createApp } from "./app";

describe("GET /api/health", () => {
  it("returns ok", async () => {
    const app = createApp();
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
```

- [ ] **Step 4: テストが失敗することを確認**

Run: `pnpm vitest run src/worker/app.test.ts`
Expected: FAIL(`./app` が存在しない)

- [ ] **Step 5: 最小実装**

`src/worker/env.ts`:

```ts
import type { Session } from "./session";

export type Env = {
  KV: KVNamespace;
  TUMBLR_CLIENT_ID: string;
  TUMBLR_CLIENT_SECRET: string;
};

export type AppEnv = {
  Bindings: Env;
  Variables: { session: Session; sid: string };
};
```

※ `./session` は Task 4 で作る。それまでは `env.ts` の import を外し `Variables: { session: unknown; sid: string }` にしておき、Task 4 で差し替えてもよい(コンパイルを通す最小手段を選ぶこと)。

`src/worker/app.ts`:

```ts
import { Hono } from "hono";
import type { AppEnv } from "./env";

export type AppDeps = { fetchFn: typeof fetch };

const defaultDeps: AppDeps = { fetchFn: fetch };

export function createApp(deps: AppDeps = defaultDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.get("/api/health", (c) => c.json({ ok: true }));
  return app;
}
```

`src/worker/index.ts`:

```ts
import { createApp } from "./app";

const app = createApp();

export default app;
```

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>endless endless summer</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/app/main.tsx"></script>
  </body>
</html>
```

`src/app/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
```

`src/app/App.tsx`:

```tsx
export function App() {
  return <h1>endless endless summer</h1>;
}
```

`src/app/styles.css`: 空ファイルで作成(Task 14 で書く)。

- [ ] **Step 6: テストが通ることを確認**

Run: `pnpm test` と `pnpm check`
Expected: PASS / lint エラーなし。さらに `pnpm dev` で http://localhost:5173 に "endless endless summer" が表示され、/api/health が `{"ok":true}` を返すこと。

- [ ] **Step 7: コミット**

```bash
git add -A
git commit -m "feat: scaffold Workers + Hono + React/Vite project with health endpoint"
```

---

### Task 2: 年均等ランダムサンプリングエンジン

**Files:**
- Create: `src/worker/sampling.ts`
- Test: `src/worker/sampling.test.ts`

**Interfaces:**
- Produces: `TUMBLR_EPOCH: number`(2007-01-01 UTC の Unix 秒)、`type Rng = () => number`([0,1) 一様)、`sampleTimestamp(notBefore: number, now: number, rng: Rng): number`(Unix 秒を返す)。Task 6 の `buildFeed` が使う。

アルゴリズム: ① `max(notBefore, TUMBLR_EPOCH)` の年〜`now` の年から**年を一様に**選ぶ → ② その年内(`notBefore`/`now` でクランプ)から**時刻を一様に**選ぶ。これによりポスト数の多い年に偏らない。

- [ ] **Step 1: 失敗するテストを書く**

`src/worker/sampling.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { type Rng, TUMBLR_EPOCH, sampleTimestamp } from "./sampling";

function seqRng(values: number[]): Rng {
  let i = 0;
  return () => values[i++ % values.length];
}

const ts = (y: number, m = 0, d = 1) => Date.UTC(y, m, d) / 1000;

describe("sampleTimestamp", () => {
  it("rng が常に 0 なら TUMBLR_EPOCH を返す", () => {
    const result = sampleTimestamp(TUMBLR_EPOCH, ts(2020), seqRng([0]));
    expect(result).toBe(TUMBLR_EPOCH);
  });

  it("結果は常に notBefore 以上", () => {
    const notBefore = ts(2015, 6);
    const result = sampleTimestamp(notBefore, ts(2015, 11, 31), seqRng([0, 0]));
    expect(result).toBeGreaterThanOrEqual(notBefore);
  });

  it("結果は常に now 以下", () => {
    const now = ts(2015, 11, 31);
    const result = sampleTimestamp(ts(2015, 6), now, seqRng([0.999999, 0.999999]));
    expect(result).toBeLessThanOrEqual(now);
  });

  it("1つ目の乱数で年が一様に選ばれる(2007〜2010 の 4 年)", () => {
    const now = ts(2010, 11, 31);
    const years = [0, 1, 2, 3].map((k) => {
      const result = sampleTimestamp(TUMBLR_EPOCH, now, seqRng([k / 4 + 0.001, 0.5]));
      return new Date(result * 1000).getUTCFullYear();
    });
    expect(years).toEqual([2007, 2008, 2009, 2010]);
  });

  it("notBefore の年が選ばれたときは年初ではなく notBefore 側にクランプされる", () => {
    const notBefore = ts(2015, 6);
    const result = sampleTimestamp(notBefore, ts(2016, 11, 31), seqRng([0.1, 0]));
    expect(result).toBe(notBefore);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm vitest run src/worker/sampling.test.ts`
Expected: FAIL(`./sampling` が存在しない)

- [ ] **Step 3: 最小実装**

`src/worker/sampling.ts`:

```ts
export const TUMBLR_EPOCH = Date.UTC(2007, 0, 1) / 1000;

export type Rng = () => number;

function yearOf(ts: number): number {
  return new Date(ts * 1000).getUTCFullYear();
}

function startOfYear(year: number): number {
  return Date.UTC(year, 0, 1) / 1000;
}

export function sampleTimestamp(notBefore: number, now: number, rng: Rng): number {
  const floor = Math.max(notBefore, TUMBLR_EPOCH);
  const startYear = yearOf(floor);
  const endYear = yearOf(now);
  const year = startYear + Math.floor(rng() * (endYear - startYear + 1));
  const lo = Math.max(floor, startOfYear(year));
  const hi = Math.min(now, startOfYear(year + 1) - 1);
  return lo + Math.floor(rng() * (hi - lo + 1));
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm vitest run src/worker/sampling.test.ts`
Expected: PASS(5 件)

- [ ] **Step 5: コミット**

```bash
git add src/worker/sampling.ts src/worker/sampling.test.ts
git commit -m "feat: add year-uniform random timestamp sampling"
```

---

### Task 3: Tumblr OAuth2 トークン関数 + TumblrClient

**Files:**
- Create: `src/worker/tumblr.ts`, `src/worker/test-helpers.ts`
- Test: `src/worker/tumblr.test.ts`

**Interfaces:**
- Produces(`src/worker/tumblr.ts`):
  - `type Tokens = { accessToken: string; refreshToken: string; expiresAt: number }`(expiresAt は Unix 秒)
  - `type Creds = { clientId: string; clientSecret: string }`
  - `type FollowingBlog = { name: string }`
  - `type UserInfo = { name: string; blogs: { name: string; title: string; primary: boolean; uuid: string }[] }`
  - `exchangeCode(creds, code: string, redirectUri: string, fetchFn?): Promise<Tokens>`
  - `refreshTokens(creds, refreshToken: string, fetchFn?): Promise<Tokens>`
  - `class TumblrClient { constructor(tokens: Tokens, creds: Creds, onTokens: (t: Tokens) => Promise<void>, fetchFn?: typeof fetch, nowFn?: () => number); userInfo(): Promise<UserInfo>; following(): Promise<FollowingBlog[]>; posts(blogName: string, before: number, limit: number): Promise<RawPost[]>; like(id: string, reblogKey: string): Promise<void>; unlike(id: string, reblogKey: string): Promise<void>; reblog(blogName: string, input: { id: string; reblogKey: string; comment?: string; tags?: string }): Promise<void> }`
  - `type RawPost = Record<string, unknown>`(Tumblr の生ポスト JSON。正規化は Task 6)
- Produces(`src/worker/test-helpers.ts`): `FakeKV`(KVNamespace 互換の get/put/delete)、`fakeFetch(routes)`(pathname 前方一致でルーティングし、呼び出しを `calls` に記録するモック fetch)

Tumblr API 仕様(実装の根拠):
- 認可 URL: `https://www.tumblr.com/oauth2/authorize`(params: client_id, response_type=code, scope=`basic write offline_access`, state, redirect_uri)
- トークン: `POST https://api.tumblr.com/v2/oauth2/token`(form-encoded。grant_type=authorization_code / refresh_token)→ `{ access_token, expires_in, refresh_token, token_type }`
- 認証付き API は `Authorization: Bearer {access_token}`。レスポンスは `{ meta, response }` 包み。
- `GET /v2/user/info` → `response.user.{name, blogs[]}`(blogs に name/title/primary/uuid)
- `GET /v2/user/following?limit=20&offset=N` → `response.{total_blogs, blogs[]}`
- `GET /v2/blog/{name}/posts?npf=true&limit=N&before={unix秒}` → `response.posts[]`
- `POST /v2/user/like` / `POST /v2/user/unlike`(form: id, reblog_key)
- `POST /v2/blog/{name}/post/reblog`(form: id, reblog_key, comment, tags)

- [ ] **Step 1: テストヘルパーを書く**

`src/worker/test-helpers.ts`:

```ts
export class FakeKV {
  store = new Map<string, string>();

  async get(key: string, type?: "json"): Promise<unknown> {
    const value = this.store.get(key) ?? null;
    if (value === null) return null;
    return type === "json" ? JSON.parse(value) : value;
  }

  async put(key: string, value: string, _opts?: { expirationTtl?: number }): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

type RouteHandler = (req: Request) => Response | object | Promise<Response | object>;

export function fakeFetch(routes: Record<string, RouteHandler>) {
  const calls: Request[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    calls.push(req.clone());
    const pathname = new URL(req.url).pathname;
    for (const [prefix, handler] of Object.entries(routes)) {
      if (pathname.startsWith(prefix)) {
        const out = await handler(req);
        return out instanceof Response ? out : Response.json(out);
      }
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return Object.assign(fn, { calls });
}
```

- [ ] **Step 2: 失敗するテストを書く**

`src/worker/tumblr.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fakeFetch } from "./test-helpers";
import { type Tokens, TumblrClient, exchangeCode, refreshTokens } from "./tumblr";

const creds = { clientId: "cid", clientSecret: "sec" };

const liveTokens: Tokens = {
  accessToken: "at",
  refreshToken: "rt",
  expiresAt: 9_999_999_999,
};

function tokenResponse() {
  return {
    access_token: "new-at",
    refresh_token: "new-rt",
    expires_in: 3600,
    token_type: "bearer",
  };
}

describe("exchangeCode", () => {
  it("認可コードをトークンに交換する", async () => {
    const fetchFn = fakeFetch({ "/v2/oauth2/token": tokenResponse });
    const tokens = await exchangeCode(creds, "the-code", "https://x/auth/callback", fetchFn);
    expect(tokens.accessToken).toBe("new-at");
  });

  it("grant_type などを form-encoded で送る", async () => {
    const fetchFn = fakeFetch({ "/v2/oauth2/token": tokenResponse });
    await exchangeCode(creds, "the-code", "https://x/auth/callback", fetchFn);
    const body = new URLSearchParams(await fetchFn.calls[0].text());
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("the-code");
    expect(body.get("client_secret")).toBe("sec");
  });
});

describe("refreshTokens", () => {
  it("refresh_token グラントで新しいトークンを得る", async () => {
    const fetchFn = fakeFetch({ "/v2/oauth2/token": tokenResponse });
    const tokens = await refreshTokens(creds, "old-rt", fetchFn);
    expect(tokens.refreshToken).toBe("new-rt");
  });
});

describe("TumblrClient", () => {
  it("Bearer トークンを付けて API を呼ぶ", async () => {
    const fetchFn = fakeFetch({
      "/v2/user/info": { response: { user: { name: "u", blogs: [] } } },
    });
    const client = new TumblrClient(liveTokens, creds, async () => {}, fetchFn);
    await client.userInfo();
    expect(fetchFn.calls[0].headers.get("Authorization")).toBe("Bearer at");
  });

  it("期限切れトークンはリフレッシュして onTokens に通知する", async () => {
    const expired: Tokens = { ...liveTokens, expiresAt: 100 };
    const saved: Tokens[] = [];
    const fetchFn = fakeFetch({
      "/v2/oauth2/token": tokenResponse,
      "/v2/user/info": { response: { user: { name: "u", blogs: [] } } },
    });
    const client = new TumblrClient(
      expired,
      creds,
      async (t) => {
        saved.push(t);
      },
      fetchFn,
      () => 1_000_000,
    );
    await client.userInfo();
    expect(saved[0]?.accessToken).toBe("new-at");
  });

  it("following は total_blogs に達するまでページングする", async () => {
    const page = (offset: number) => ({
      response: {
        total_blogs: 3,
        blogs:
          offset === 0
            ? [{ name: "a" }, { name: "b" }]
            : [{ name: "c" }],
      },
    });
    const fetchFn = fakeFetch({
      "/v2/user/following": (req) =>
        page(Number(new URL(req.url).searchParams.get("offset"))),
    });
    const client = new TumblrClient(liveTokens, creds, async () => {}, fetchFn);
    const blogs = await client.following();
    expect(blogs.map((b) => b.name)).toEqual(["a", "b", "c"]);
  });

  it("posts は npf=true と before を付けて呼ぶ", async () => {
    const fetchFn = fakeFetch({
      "/v2/blog/example/posts": { response: { posts: [{ id_string: "1" }] } },
    });
    const client = new TumblrClient(liveTokens, creds, async () => {}, fetchFn);
    await client.posts("example", 1234567890, 2);
    const url = new URL(fetchFn.calls[0].url);
    expect(url.searchParams.get("npf")).toBe("true");
    expect(url.searchParams.get("before")).toBe("1234567890");
    expect(url.searchParams.get("limit")).toBe("2");
  });

  it("reblog は id と reblog_key を form で POST する", async () => {
    const fetchFn = fakeFetch({
      "/v2/blog/myblog/post/reblog": { response: {} },
    });
    const client = new TumblrClient(liveTokens, creds, async () => {}, fetchFn);
    await client.reblog("myblog", { id: "1", reblogKey: "rk", comment: "hi", tags: "a,b" });
    const body = new URLSearchParams(await fetchFn.calls[0].text());
    expect(body.get("id")).toBe("1");
    expect(body.get("reblog_key")).toBe("rk");
    expect(body.get("tags")).toBe("a,b");
  });

  it("like は /v2/user/like に POST する", async () => {
    const fetchFn = fakeFetch({ "/v2/user/like": { response: {} } });
    const client = new TumblrClient(liveTokens, creds, async () => {}, fetchFn);
    await client.like("1", "rk");
    expect(new URL(fetchFn.calls[0].url).pathname).toBe("/v2/user/like");
  });

  it("API がエラーを返したら例外を投げる", async () => {
    const fetchFn = fakeFetch({
      "/v2/user/info": () => new Response("nope", { status: 401 }),
    });
    const client = new TumblrClient(liveTokens, creds, async () => {}, fetchFn);
    await expect(client.userInfo()).rejects.toThrow("401");
  });
});
```

- [ ] **Step 3: テストが失敗することを確認**

Run: `pnpm vitest run src/worker/tumblr.test.ts`
Expected: FAIL(`./tumblr` が存在しない)

- [ ] **Step 4: 最小実装**

`src/worker/tumblr.ts`:

```ts
export type Tokens = { accessToken: string; refreshToken: string; expiresAt: number };
export type Creds = { clientId: string; clientSecret: string };
export type FollowingBlog = { name: string };
export type UserInfo = {
  name: string;
  blogs: { name: string; title: string; primary: boolean; uuid: string }[];
};
export type RawPost = Record<string, unknown>;

const API = "https://api.tumblr.com/v2";
const TOKEN_URL = `${API}/oauth2/token`;

type TokenBody = { access_token: string; refresh_token: string; expires_in: number };

async function requestTokens(
  params: Record<string, string>,
  fetchFn: typeof fetch,
): Promise<Tokens> {
  const res = await fetchFn(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  if (!res.ok) throw new Error(`token request failed: ${res.status}`);
  const body = (await res.json()) as TokenBody;
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: Math.floor(Date.now() / 1000) + body.expires_in,
  };
}

export function exchangeCode(
  creds: Creds,
  code: string,
  redirectUri: string,
  fetchFn: typeof fetch = fetch,
): Promise<Tokens> {
  return requestTokens(
    {
      grant_type: "authorization_code",
      code,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      redirect_uri: redirectUri,
    },
    fetchFn,
  );
}

export function refreshTokens(
  creds: Creds,
  refreshToken: string,
  fetchFn: typeof fetch = fetch,
): Promise<Tokens> {
  return requestTokens(
    {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
    },
    fetchFn,
  );
}

export class TumblrClient {
  constructor(
    private tokens: Tokens,
    private creds: Creds,
    private onTokens: (tokens: Tokens) => Promise<void>,
    private fetchFn: typeof fetch = fetch,
    private nowFn: () => number = () => Math.floor(Date.now() / 1000),
  ) {}

  private async ensureFresh(): Promise<void> {
    if (this.tokens.expiresAt - 60 > this.nowFn()) return;
    this.tokens = await refreshTokens(this.creds, this.tokens.refreshToken, this.fetchFn);
    await this.onTokens(this.tokens);
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    await this.ensureFresh();
    const res = await this.fetchFn(`${API}${path}`, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${this.tokens.accessToken}`,
      },
    });
    if (!res.ok) {
      throw new Error(`tumblr api error: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as { response: T };
    return body.response;
  }

  private postForm(path: string, params: Record<string, string>): Promise<unknown> {
    return this.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
    });
  }

  async userInfo(): Promise<UserInfo> {
    const { user } = await this.request<{ user: UserInfo }>("/user/info");
    return user;
  }

  async following(): Promise<FollowingBlog[]> {
    const blogs: FollowingBlog[] = [];
    const limit = 20;
    const maxPages = 50;
    for (let page = 0; page < maxPages; page++) {
      const res = await this.request<{ total_blogs: number; blogs: FollowingBlog[] }>(
        `/user/following?limit=${limit}&offset=${page * limit}`,
      );
      blogs.push(...res.blogs);
      if (blogs.length >= res.total_blogs || res.blogs.length === 0) break;
    }
    return blogs;
  }

  async posts(blogName: string, before: number, limit: number): Promise<RawPost[]> {
    const res = await this.request<{ posts: RawPost[] }>(
      `/blog/${encodeURIComponent(blogName)}/posts?npf=true&limit=${limit}&before=${before}`,
    );
    return res.posts;
  }

  async like(id: string, reblogKey: string): Promise<void> {
    await this.postForm("/user/like", { id, reblog_key: reblogKey });
  }

  async unlike(id: string, reblogKey: string): Promise<void> {
    await this.postForm("/user/unlike", { id, reblog_key: reblogKey });
  }

  async reblog(
    blogName: string,
    input: { id: string; reblogKey: string; comment?: string; tags?: string },
  ): Promise<void> {
    await this.postForm(`/blog/${encodeURIComponent(blogName)}/post/reblog`, {
      id: input.id,
      reblog_key: input.reblogKey,
      ...(input.comment ? { comment: input.comment } : {}),
      ...(input.tags ? { tags: input.tags } : {}),
    });
  }
}
```

- [ ] **Step 5: テストが通ることを確認**

Run: `pnpm vitest run src/worker/tumblr.test.ts`
Expected: PASS(10 件)

- [ ] **Step 6: コミット**

```bash
git add src/worker/tumblr.ts src/worker/tumblr.test.ts src/worker/test-helpers.ts
git commit -m "feat: add Tumblr OAuth2 token exchange and API client"
```

---

### Task 4: SessionStore + requireSession ミドルウェア

**Files:**
- Create: `src/worker/session.ts`
- Modify: `src/worker/env.ts`(`Variables` の `session` 型を `Session` に確定)
- Test: `src/worker/session.test.ts`

**Interfaces:**
- Consumes: `Tokens`(Task 3)
- Produces(`src/worker/session.ts`):
  - `type SessionBlog = { name: string; title: string; primary: boolean; uuid: string }`
  - `type Session = { tokens: Tokens; userName: string; blogs: SessionBlog[] }`
  - `class SessionStore { constructor(kv: KVNamespace); create(session: Session): Promise<string>; get(sid: string): Promise<Session | null>; update(sid: string, session: Session): Promise<void>; delete(sid: string): Promise<void> }`(KV キー `session:{sid}`、TTL 30 日)
  - `requireSession(): MiddlewareHandler<AppEnv>` — `sid` クッキーからセッションを引き、無ければ 401 JSON。成功時 `c.set("session", ...)` / `c.set("sid", ...)`

- [ ] **Step 1: 失敗するテストを書く**

`src/worker/session.test.ts`:

```ts
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "./env";
import { type Session, SessionStore, requireSession } from "./session";
import { FakeKV } from "./test-helpers";

const session: Session = {
  tokens: { accessToken: "at", refreshToken: "rt", expiresAt: 9_999_999_999 },
  userName: "u",
  blogs: [{ name: "myblog", title: "My Blog", primary: true, uuid: "uuid-1" }],
};

describe("SessionStore", () => {
  it("create したセッションを get で取り出せる", async () => {
    const store = new SessionStore(new FakeKV() as unknown as KVNamespace);
    const sid = await store.create(session);
    expect(await store.get(sid)).toEqual(session);
  });

  it("delete するとセッションは消える", async () => {
    const store = new SessionStore(new FakeKV() as unknown as KVNamespace);
    const sid = await store.create(session);
    await store.delete(sid);
    expect(await store.get(sid)).toBeNull();
  });

  it("update でトークンを差し替えられる", async () => {
    const store = new SessionStore(new FakeKV() as unknown as KVNamespace);
    const sid = await store.create(session);
    const updated = { ...session, userName: "u2" };
    await store.update(sid, updated);
    expect((await store.get(sid))?.userName).toBe("u2");
  });
});

describe("requireSession", () => {
  function appWithProtectedRoute() {
    const app = new Hono<AppEnv>();
    app.get("/protected", requireSession(), (c) =>
      c.json({ userName: c.get("session").userName }),
    );
    return app;
  }

  it("sid クッキーが無ければ 401", async () => {
    const res = await appWithProtectedRoute().request(
      "/protected",
      {},
      { KV: new FakeKV(), TUMBLR_CLIENT_ID: "", TUMBLR_CLIENT_SECRET: "" },
    );
    expect(res.status).toBe(401);
  });

  it("有効な sid ならセッションがコンテキストに入る", async () => {
    const kv = new FakeKV();
    const store = new SessionStore(kv as unknown as KVNamespace);
    const sid = await store.create(session);
    const res = await appWithProtectedRoute().request(
      "/protected",
      { headers: { Cookie: `sid=${sid}` } },
      { KV: kv, TUMBLR_CLIENT_ID: "", TUMBLR_CLIENT_SECRET: "" },
    );
    expect(await res.json()).toEqual({ userName: "u" });
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm vitest run src/worker/session.test.ts`
Expected: FAIL(`./session` が存在しない)

- [ ] **Step 3: 最小実装**

`src/worker/session.ts`:

```ts
import { getCookie } from "hono/cookie";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "./env";
import type { Tokens } from "./tumblr";

export type SessionBlog = { name: string; title: string; primary: boolean; uuid: string };
export type Session = { tokens: Tokens; userName: string; blogs: SessionBlog[] };

const SESSION_TTL = 60 * 60 * 24 * 30;

export class SessionStore {
  constructor(private kv: KVNamespace) {}

  private key(sid: string): string {
    return `session:${sid}`;
  }

  async create(session: Session): Promise<string> {
    const sid = crypto.randomUUID();
    await this.update(sid, session);
    return sid;
  }

  async get(sid: string): Promise<Session | null> {
    return (await this.kv.get(this.key(sid), "json")) as Session | null;
  }

  async update(sid: string, session: Session): Promise<void> {
    await this.kv.put(this.key(sid), JSON.stringify(session), {
      expirationTtl: SESSION_TTL,
    });
  }

  async delete(sid: string): Promise<void> {
    await this.kv.delete(this.key(sid));
  }
}

export function requireSession(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const sid = getCookie(c, "sid");
    if (!sid) return c.json({ error: "unauthorized" }, 401);
    const session = await new SessionStore(c.env.KV).get(sid);
    if (!session) return c.json({ error: "unauthorized" }, 401);
    c.set("session", session);
    c.set("sid", sid);
    await next();
  };
}
```

`src/worker/env.ts` の `Variables` を確定(Task 1 で仮置きした場合はここで差し替え):

```ts
import type { Session } from "./session";

export type Env = {
  KV: KVNamespace;
  TUMBLR_CLIENT_ID: string;
  TUMBLR_CLIENT_SECRET: string;
};

export type AppEnv = {
  Bindings: Env;
  Variables: { session: Session; sid: string };
};
```

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm test`
Expected: 全テスト PASS

- [ ] **Step 5: コミット**

```bash
git add src/worker/session.ts src/worker/session.test.ts src/worker/env.ts
git commit -m "feat: add KV session store and auth middleware"
```

---

### Task 5: OAuth ルート(/auth/login, /auth/callback, /auth/logout)+ /api/me

**Files:**
- Create: `src/worker/auth.ts`
- Modify: `src/worker/app.ts`(auth/api ルート登録)、`src/worker/api.ts` を新規作成(/api/me のみ。feed 等は Task 6, 11)
- Test: `src/worker/auth.test.ts`

**Interfaces:**
- Consumes: `exchangeCode`, `TumblrClient`(Task 3)、`SessionStore`, `requireSession`(Task 4)、`AppDeps`(Task 1)
- Produces:
  - `registerAuthRoutes(app: Hono<AppEnv>, deps: AppDeps): void`
  - `registerApiRoutes(app: Hono<AppEnv>, deps: AppDeps): void`
  - HTTP 契約: `GET /auth/login` → Tumblr 認可画面へ 302(state クッキー設定)。`GET /auth/callback?code&state` → セッション作成、`sid` クッキー設定、`/` へ 302。`POST /auth/logout` → セッション削除。`GET /api/me` → `{ userName, blogs }` or 401。フロント(Task 7)はこの契約に依存。

- [ ] **Step 1: 失敗するテストを書く**

`src/worker/auth.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { type Session, SessionStore } from "./session";
import { FakeKV, fakeFetch } from "./test-helpers";

const env = (kv: FakeKV) => ({
  KV: kv,
  TUMBLR_CLIENT_ID: "cid",
  TUMBLR_CLIENT_SECRET: "sec",
});

const tumblrMocks = {
  "/v2/oauth2/token": {
    access_token: "at",
    refresh_token: "rt",
    expires_in: 3600,
    token_type: "bearer",
  },
  "/v2/user/info": {
    response: {
      user: {
        name: "u",
        blogs: [{ name: "myblog", title: "My Blog", primary: true, uuid: "uuid-1" }],
      },
    },
  },
};

describe("GET /auth/login", () => {
  it("Tumblr の認可 URL にリダイレクトする", async () => {
    const app = createApp({ fetchFn: fakeFetch({}) });
    const res = await app.request("https://ees.example/auth/login", {}, env(new FakeKV()));
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("Location") ?? "");
    expect(location.origin + location.pathname).toBe("https://www.tumblr.com/oauth2/authorize");
    expect(location.searchParams.get("scope")).toBe("basic write offline_access");
    expect(location.searchParams.get("redirect_uri")).toBe(
      "https://ees.example/auth/callback",
    );
  });

  it("state クッキーを設定する", async () => {
    const app = createApp({ fetchFn: fakeFetch({}) });
    const res = await app.request("https://ees.example/auth/login", {}, env(new FakeKV()));
    expect(res.headers.get("Set-Cookie")).toContain("oauth_state=");
  });
});

describe("GET /auth/callback", () => {
  it("state が一致しなければ 400", async () => {
    const app = createApp({ fetchFn: fakeFetch(tumblrMocks) });
    const res = await app.request(
      "https://ees.example/auth/callback?code=c&state=bad",
      { headers: { Cookie: "oauth_state=good" } },
      env(new FakeKV()),
    );
    expect(res.status).toBe(400);
  });

  it("成功時はセッションを作って / にリダイレクトする", async () => {
    const kv = new FakeKV();
    const app = createApp({ fetchFn: fakeFetch(tumblrMocks) });
    const res = await app.request(
      "https://ees.example/auth/callback?code=c&state=s",
      { headers: { Cookie: "oauth_state=s" } },
      env(kv),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/");
    expect(res.headers.get("Set-Cookie")).toContain("sid=");
    const stored = [...kv.store.keys()].find((k) => k.startsWith("session:"));
    expect(stored).toBeDefined();
  });
});

describe("GET /api/me", () => {
  it("セッションがあればユーザー情報を返す", async () => {
    const kv = new FakeKV();
    const session: Session = {
      tokens: { accessToken: "at", refreshToken: "rt", expiresAt: 9_999_999_999 },
      userName: "u",
      blogs: [{ name: "myblog", title: "My Blog", primary: true, uuid: "uuid-1" }],
    };
    const sid = await new SessionStore(kv as unknown as KVNamespace).create(session);
    const app = createApp({ fetchFn: fakeFetch({}) });
    const res = await app.request(
      "/api/me",
      { headers: { Cookie: `sid=${sid}` } },
      env(kv),
    );
    expect(await res.json()).toEqual({ userName: "u", blogs: session.blogs });
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm vitest run src/worker/auth.test.ts`
Expected: FAIL(/auth/login が 404)

- [ ] **Step 3: 最小実装**

`src/worker/auth.ts`:

```ts
import type { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppDeps } from "./app";
import type { AppEnv } from "./env";
import { SessionStore } from "./session";
import { TumblrClient, exchangeCode } from "./tumblr";

const AUTHORIZE_URL = "https://www.tumblr.com/oauth2/authorize";

function redirectUri(requestUrl: string): string {
  return new URL("/auth/callback", requestUrl).toString();
}

const cookieOpts = { httpOnly: true, secure: true, sameSite: "Lax" as const, path: "/" };

export function registerAuthRoutes(app: Hono<AppEnv>, deps: AppDeps): void {
  app.get("/auth/login", (c) => {
    const state = crypto.randomUUID();
    setCookie(c, "oauth_state", state, { ...cookieOpts, maxAge: 600 });
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set("client_id", c.env.TUMBLR_CLIENT_ID);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "basic write offline_access");
    url.searchParams.set("state", state);
    url.searchParams.set("redirect_uri", redirectUri(c.req.url));
    return c.redirect(url.toString());
  });

  app.get("/auth/callback", async (c) => {
    const state = c.req.query("state");
    const saved = getCookie(c, "oauth_state");
    if (!state || state !== saved) return c.text("state mismatch", 400);
    deleteCookie(c, "oauth_state", { path: "/" });

    const code = c.req.query("code");
    if (!code) return c.text("missing code", 400);

    const creds = {
      clientId: c.env.TUMBLR_CLIENT_ID,
      clientSecret: c.env.TUMBLR_CLIENT_SECRET,
    };
    const tokens = await exchangeCode(creds, code, redirectUri(c.req.url), deps.fetchFn);
    const client = new TumblrClient(tokens, creds, async () => {}, deps.fetchFn);
    const user = await client.userInfo();

    const store = new SessionStore(c.env.KV);
    const sid = await store.create({ tokens, userName: user.name, blogs: user.blogs });
    setCookie(c, "sid", sid, { ...cookieOpts, maxAge: 60 * 60 * 24 * 30 });
    return c.redirect("/");
  });

  app.post("/auth/logout", async (c) => {
    const sid = getCookie(c, "sid");
    if (sid) await new SessionStore(c.env.KV).delete(sid);
    deleteCookie(c, "sid", { path: "/" });
    return c.redirect("/");
  });
}
```

`src/worker/api.ts`(このタスクでは /api/me のみ):

```ts
import type { Hono } from "hono";
import type { AppDeps } from "./app";
import type { AppEnv } from "./env";
import { SessionStore, requireSession } from "./session";
import { TumblrClient } from "./tumblr";

export function clientForSession(
  c: Parameters<Parameters<Hono<AppEnv>["get"]>[1]>[0],
  deps: AppDeps,
): TumblrClient {
  const session = c.get("session");
  const sid = c.get("sid");
  const store = new SessionStore(c.env.KV);
  return new TumblrClient(
    session.tokens,
    { clientId: c.env.TUMBLR_CLIENT_ID, clientSecret: c.env.TUMBLR_CLIENT_SECRET },
    async (tokens) => {
      await store.update(sid, { ...session, tokens });
    },
    deps.fetchFn,
  );
}

export function registerApiRoutes(app: Hono<AppEnv>, deps: AppDeps): void {
  app.get("/api/me", requireSession(), (c) => {
    const session = c.get("session");
    return c.json({ userName: session.userName, blogs: session.blogs });
  });
}
```

※ `clientForSession` の第一引数型が煩雑なら `Context<AppEnv>`(`import type { Context } from "hono"`)を使う。

`src/worker/app.ts` を修正:

```ts
import { Hono } from "hono";
import { registerApiRoutes } from "./api";
import { registerAuthRoutes } from "./auth";
import type { AppEnv } from "./env";

export type AppDeps = { fetchFn: typeof fetch };

const defaultDeps: AppDeps = { fetchFn: fetch };

export function createApp(deps: AppDeps = defaultDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.get("/api/health", (c) => c.json({ ok: true }));
  registerAuthRoutes(app, deps);
  registerApiRoutes(app, deps);
  return app;
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm test`
Expected: 全テスト PASS

- [ ] **Step 5: コミット**

```bash
git add src/worker/auth.ts src/worker/api.ts src/worker/app.ts src/worker/auth.test.ts
git commit -m "feat: add Tumblr OAuth2 login flow and /api/me"
```

---

### Task 6: 共有型 + /api/feed(buildFeed・正規化)

**Files:**
- Create: `src/shared/types.ts`, `src/worker/feed.ts`
- Modify: `src/worker/api.ts`(/api/feed 追加)
- Test: `src/worker/feed.test.ts`

**Interfaces:**
- Consumes: `sampleTimestamp`, `TUMBLR_EPOCH`, `Rng`(Task 2)、`TumblrClient`(Task 3)、`requireSession`, `clientForSession`(Task 4, 5)
- Produces(`src/shared/types.ts` — フロントも import する):

```ts
export type NpfMedia = { url: string; type?: string; width?: number; height?: number };
export type NpfFormatting = {
  start: number;
  end: number;
  type: string; // "bold" | "italic" | "link" | ...
  url?: string;
};
export type NpfTextBlock = {
  type: "text";
  text: string;
  subtype?: string;
  formatting?: NpfFormatting[];
};
export type NpfImageBlock = { type: "image"; media: NpfMedia[]; alt_text?: string };
export type NpfLinkBlock = { type: "link"; url: string; title?: string; description?: string };
export type NpfVideoBlock = {
  type: "video";
  media?: NpfMedia;
  poster?: NpfMedia[];
  embed_iframe?: { url: string; width?: number; height?: number };
  url?: string;
};
export type NpfAudioBlock = {
  type: "audio";
  media?: NpfMedia;
  title?: string;
  artist?: string;
  url?: string;
};
export type NpfBlock =
  | NpfTextBlock
  | NpfImageBlock
  | NpfLinkBlock
  | NpfVideoBlock
  | NpfAudioBlock;

export type PostKind = "text" | "image" | "link" | "audio" | "video";

export type TrailItem = { blogName: string; content: NpfBlock[] };

export type FeedPost = {
  id: string;
  blogName: string;
  postUrl: string;
  timestamp: number;
  tags: string[];
  reblogKey: string;
  liked: boolean;
  kind: PostKind;
  content: NpfBlock[];
  trail: TrailItem[];
};

export type MeBlog = { name: string; title: string; primary: boolean; uuid: string };
export type Me = { userName: string; blogs: MeBlog[] };
```

- Produces(`src/worker/feed.ts`):
  - `type FeedClient = Pick<TumblrClient, "following" | "posts">`
  - `buildFeed(client: FeedClient, kv: KVNamespace, userName: string, rng: Rng, now: number): Promise<FeedPost[]>`
  - `normalizePost(raw: RawPost): FeedPost` / `deriveKind(blocks: NpfBlock[]): PostKind`
  - HTTP 契約: `GET /api/feed` → `{ posts: FeedPost[] }`(要セッション)

- [ ] **Step 1: 失敗するテストを書く**

`src/worker/feed.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { TUMBLR_EPOCH } from "./sampling";
import { buildFeed, deriveKind, normalizePost } from "./feed";
import { FakeKV } from "./test-helpers";
import type { RawPost } from "./tumblr";

const rawPost = (over: Partial<Record<string, unknown>> = {}): RawPost => ({
  id_string: "123",
  blog_name: "example",
  post_url: "https://example.tumblr.com/post/123",
  timestamp: 1_500_000_000,
  tags: ["summer"],
  reblog_key: "rk",
  liked: false,
  content: [{ type: "text", text: "hello" }],
  trail: [],
  ...over,
});

describe("deriveKind", () => {
  it("video ブロックがあれば video", () => {
    expect(deriveKind([{ type: "text", text: "x" }, { type: "video" }])).toBe("video");
  });

  it("image ブロックがあれば image", () => {
    expect(deriveKind([{ type: "image", media: [] }])).toBe("image");
  });

  it("ブロックが無ければ text", () => {
    expect(deriveKind([])).toBe("text");
  });
});

describe("normalizePost", () => {
  it("生ポストを FeedPost に変換する", () => {
    const post = normalizePost(rawPost());
    expect(post).toEqual({
      id: "123",
      blogName: "example",
      postUrl: "https://example.tumblr.com/post/123",
      timestamp: 1_500_000_000,
      tags: ["summer"],
      reblogKey: "rk",
      liked: false,
      kind: "text",
      content: [{ type: "text", text: "hello" }],
      trail: [],
    });
  });

  it("trail はブログ名とコンテンツに絞る", () => {
    const post = normalizePost(
      rawPost({
        trail: [{ blog: { name: "origin" }, content: [{ type: "text", text: "og" }] }],
      }),
    );
    expect(post.trail).toEqual([
      { blogName: "origin", content: [{ type: "text", text: "og" }] },
    ]);
  });

  it("kind は trail のブロックも見て判定する", () => {
    const post = normalizePost(
      rawPost({
        content: [],
        trail: [{ blog: { name: "o" }, content: [{ type: "image", media: [] }] }],
      }),
    );
    expect(post.kind).toBe("image");
  });
});

describe("buildFeed", () => {
  function fakeClient(postsByBlog: Record<string, RawPost[]>) {
    const calls: { blog: string; before: number }[] = [];
    return {
      calls,
      following: async () => Object.keys(postsByBlog).map((name) => ({ name })),
      posts: async (blog: string, before: number, _limit: number) => {
        calls.push({ blog, before });
        return postsByBlog[blog] ?? [];
      },
    };
  }

  const now = 1_750_000_000;

  it("フォロー中ブログのポストを正規化して返す", async () => {
    const client = fakeClient({ a: [rawPost()], b: [rawPost({ id_string: "9" })] });
    const kv = new FakeKV();
    const posts = await buildFeed(
      client,
      kv as unknown as KVNamespace,
      "u",
      () => 0.5,
      now,
    );
    expect(posts.length).toBeGreaterThan(0);
    expect(posts[0]).toHaveProperty("reblogKey");
  });

  it("following 一覧を KV にキャッシュする", async () => {
    const client = fakeClient({ a: [rawPost()] });
    const kv = new FakeKV();
    await buildFeed(client, kv as unknown as KVNamespace, "u", () => 0.5, now);
    expect(await kv.get("following:u", "json")).toEqual([{ name: "a" }]);
  });

  it("空バッチのブログには oldest: の下限を記録する", async () => {
    const client = fakeClient({ empty: [] });
    const kv = new FakeKV();
    await buildFeed(client, kv as unknown as KVNamespace, "u", () => 0.5, now);
    const bound = (await kv.get("oldest:empty", "json")) as number;
    expect(bound).toBeGreaterThan(TUMBLR_EPOCH);
  });

  it("記録済みの oldest: 下限より前はサンプルしない", async () => {
    const client = fakeClient({ a: [rawPost()] });
    const kv = new FakeKV();
    const bound = 1_600_000_000;
    await kv.put("oldest:a", JSON.stringify(bound));
    await buildFeed(client, kv as unknown as KVNamespace, "u", () => 0, now);
    for (const call of client.calls) {
      expect(call.before).toBeGreaterThanOrEqual(bound);
    }
  });

  it("フォローが 0 件なら空配列を返す", async () => {
    const client = fakeClient({});
    const posts = await buildFeed(
      client,
      new FakeKV() as unknown as KVNamespace,
      "u",
      () => 0.5,
      now,
    );
    expect(posts).toEqual([]);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm vitest run src/worker/feed.test.ts`
Expected: FAIL(`./feed` が存在しない)

- [ ] **Step 3: 最小実装**

`src/shared/types.ts`: 上の Interfaces ブロックの内容をそのまま作成。

`src/worker/feed.ts`:

```ts
import type { FeedPost, NpfBlock, PostKind, TrailItem } from "../shared/types";
import { type Rng, TUMBLR_EPOCH, sampleTimestamp } from "./sampling";
import type { RawPost, TumblrClient } from "./tumblr";

export const SAMPLES_PER_BATCH = 6;
export const POSTS_PER_SAMPLE = 2;
export const FOLLOWING_TTL = 3600;

export type FeedClient = Pick<TumblrClient, "following" | "posts">;

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

function shuffle<T>(items: T[], rng: Rng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

async function cachedFollowing(
  client: FeedClient,
  kv: KVNamespace,
  userName: string,
): Promise<{ name: string }[]> {
  const key = `following:${userName}`;
  const cached = (await kv.get(key, "json")) as { name: string }[] | null;
  if (cached) return cached;
  const blogs = await client.following();
  await kv.put(key, JSON.stringify(blogs), { expirationTtl: FOLLOWING_TTL });
  return blogs;
}

export async function buildFeed(
  client: FeedClient,
  kv: KVNamespace,
  userName: string,
  rng: Rng,
  now: number,
): Promise<FeedPost[]> {
  const following = await cachedFollowing(client, kv, userName);
  if (following.length === 0) return [];

  const samples = Array.from(
    { length: SAMPLES_PER_BATCH },
    () => following[Math.floor(rng() * following.length)],
  );

  const batches = await Promise.all(
    samples.map(async (blog) => {
      const boundKey = `oldest:${blog.name}`;
      const notBefore = ((await kv.get(boundKey, "json")) as number | null) ?? TUMBLR_EPOCH;
      const before = sampleTimestamp(notBefore, now, rng);
      const posts = await client.posts(blog.name, before, POSTS_PER_SAMPLE);
      if (posts.length === 0) {
        // 「before 以前にポストは無い」と学習し、次回以降のサンプル範囲を狭める
        await kv.put(boundKey, JSON.stringify(before));
        return [];
      }
      return posts.map(normalizePost);
    }),
  );

  return shuffle(batches.flat(), rng);
}
```

`src/worker/api.ts` の `registerApiRoutes` に追加:

```ts
import { buildFeed } from "./feed";

// registerApiRoutes 内に追記
app.get("/api/feed", requireSession(), async (c) => {
  const client = clientForSession(c, deps);
  const posts = await buildFeed(
    client,
    c.env.KV,
    c.get("session").userName,
    Math.random,
    Math.floor(Date.now() / 1000),
  );
  return c.json({ posts });
});
```

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm test`
Expected: 全テスト PASS

- [ ] **Step 5: コミット**

```bash
git add src/shared/types.ts src/worker/feed.ts src/worker/feed.test.ts src/worker/api.ts
git commit -m "feat: add /api/feed with year-uniform random post sampling"
```

---

### Task 7: フロント認証ゲート + ログイン画面

**Files:**
- Create: `src/app/api.ts`, `src/app/components/LoginScreen.tsx`
- Modify: `src/app/App.tsx`
- Test: `src/app/App.test.tsx`

**Interfaces:**
- Consumes: `Me`, `FeedPost`(`src/shared/types.ts`)、HTTP 契約(Task 5, 6)
- Produces(`src/app/api.ts`):
  - `fetchMe(): Promise<Me | null>`(401 なら null)
  - `fetchFeed(): Promise<FeedPost[]>`
  - `likePost(id: string, reblogKey: string, like: boolean): Promise<void>`(Task 11 のエンドポイントを呼ぶ。ここで定義だけ先にしてよい)
  - `reblogPost(input: { id: string; reblogKey: string; blogName?: string; comment?: string; tags?: string }): Promise<void>`
- Produces(`src/app/App.tsx`): 認証状態 `loading | anonymous | authed` の出し分け。authed 時は `<Feed me={me} />`(Task 9 で実装。それまでは仮の `<div>feed</div>`)。

- [ ] **Step 1: 失敗するテストを書く**

`src/app/App.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(handler: (url: string) => Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => handler(String(input))),
  );
}

describe("App", () => {
  it("未ログインならログインボタンを表示する", async () => {
    stubFetch((url) =>
      url.includes("/api/me")
        ? new Response("{}", { status: 401 })
        : Response.json({ posts: [] }),
    );
    render(<App />);
    expect(await screen.findByText("Log in with Tumblr")).toBeInTheDocument();
  });

  it("ログイン済みならフィード画面を表示する", async () => {
    stubFetch((url) =>
      url.includes("/api/me")
        ? Response.json({ userName: "u", blogs: [] })
        : Response.json({ posts: [] }),
    );
    render(<App />);
    expect(await screen.findByTestId("feed")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm vitest run src/app/App.test.tsx`
Expected: FAIL(ログインボタンが無い)

- [ ] **Step 3: 最小実装**

`src/app/api.ts`:

```ts
import type { FeedPost, Me } from "../shared/types";

async function postJson(path: string, body: unknown): Promise<void> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
}

export async function fetchMe(): Promise<Me | null> {
  const res = await fetch("/api/me");
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`/api/me failed: ${res.status}`);
  return (await res.json()) as Me;
}

export async function fetchFeed(): Promise<FeedPost[]> {
  const res = await fetch("/api/feed");
  if (!res.ok) throw new Error(`/api/feed failed: ${res.status}`);
  const body = (await res.json()) as { posts: FeedPost[] };
  return body.posts;
}

export function likePost(id: string, reblogKey: string, like: boolean): Promise<void> {
  return postJson("/api/like", { id, reblogKey, like });
}

export function reblogPost(input: {
  id: string;
  reblogKey: string;
  blogName?: string;
  comment?: string;
  tags?: string;
}): Promise<void> {
  return postJson("/api/reblog", input);
}
```

`src/app/components/LoginScreen.tsx`:

```tsx
export function LoginScreen() {
  return (
    <main className="login-screen">
      <h1>endless endless summer</h1>
      <p>A dashboard that forgets what time it is.</p>
      <a className="login-button" href="/auth/login">
        Log in with Tumblr
      </a>
    </main>
  );
}
```

`src/app/App.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { Me } from "../shared/types";
import { fetchMe } from "./api";
import { LoginScreen } from "./components/LoginScreen";

type AuthState = { status: "loading" } | { status: "anonymous" } | { status: "authed"; me: Me };

export function App() {
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    fetchMe()
      .then((me) => setAuth(me ? { status: "authed", me } : { status: "anonymous" }))
      .catch(() => setAuth({ status: "anonymous" }));
  }, []);

  if (auth.status === "loading") return null;
  if (auth.status === "anonymous") return <LoginScreen />;
  return <div data-testid="feed">feed</div>;
}
```

※ `data-testid="feed"` の仮 div は Task 9 で `<Feed me={auth.me} />` に置き換える(Feed 側のルート要素に同じ testid を付ける)。

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm test`
Expected: 全テスト PASS

- [ ] **Step 5: コミット**

```bash
git add src/app/api.ts src/app/components/LoginScreen.tsx src/app/App.tsx src/app/App.test.tsx
git commit -m "feat: add auth gate and login screen"
```

---

### Task 8: NPF レンダラー

**Files:**
- Create: `src/app/npf/format.ts`, `src/app/npf/NpfContent.tsx`
- Test: `src/app/npf/format.test.ts`, `src/app/npf/NpfContent.test.tsx`

**Interfaces:**
- Consumes: `NpfBlock` 系型(`src/shared/types.ts`)
- Produces:
  - `applyFormatting(text: string, formatting?: NpfFormatting[]): TextSegment[]`、`type TextSegment = { text: string; bold: boolean; italic: boolean; href: string | null }`
  - `<NpfContent blocks={NpfBlock[]} />` — text/image/link/video/audio をレンダリング。未知タイプは無視。**`dangerouslySetInnerHTML` は使わない**(`embed_html` は使わず `embed_iframe` かリンクにフォールバック)。
- 既知の簡略化(v1 で許容): NPF の `layout`(rows/ask)は無視して縦に順番に描画。リストアイテムは 1 件ずつ `<ul>`/`<ol>` で包む。

- [ ] **Step 1: applyFormatting の失敗するテストを書く**

`src/app/npf/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyFormatting } from "./format";

describe("applyFormatting", () => {
  it("フォーマット無しなら 1 セグメント", () => {
    expect(applyFormatting("hello")).toEqual([
      { text: "hello", bold: false, italic: false, href: null },
    ]);
  });

  it("bold 範囲が分割される", () => {
    const segments = applyFormatting("hello world", [
      { start: 0, end: 5, type: "bold" },
    ]);
    expect(segments).toEqual([
      { text: "hello", bold: true, italic: false, href: null },
      { text: " world", bold: false, italic: false, href: null },
    ]);
  });

  it("重なった bold と link が両方反映される", () => {
    const segments = applyFormatting("abcd", [
      { start: 0, end: 4, type: "bold" },
      { start: 2, end: 4, type: "link", url: "https://x" },
    ]);
    expect(segments).toEqual([
      { text: "ab", bold: true, italic: false, href: null },
      { text: "cd", bold: true, italic: false, href: "https://x" },
    ]);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm vitest run src/app/npf/format.test.ts`
Expected: FAIL

- [ ] **Step 3: applyFormatting を実装**

`src/app/npf/format.ts`:

```ts
import type { NpfFormatting } from "../../shared/types";

export type TextSegment = {
  text: string;
  bold: boolean;
  italic: boolean;
  href: string | null;
};

export function applyFormatting(
  text: string,
  formatting: NpfFormatting[] = [],
): TextSegment[] {
  const boundaries = new Set([0, text.length]);
  for (const f of formatting) {
    boundaries.add(f.start);
    boundaries.add(f.end);
  }
  const points = [...boundaries].sort((a, b) => a - b);
  const segments: TextSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    const active = formatting.filter((f) => f.start <= start && end <= f.end);
    segments.push({
      text: text.slice(start, end),
      bold: active.some((f) => f.type === "bold"),
      italic: active.some((f) => f.type === "italic"),
      href: active.find((f) => f.type === "link")?.url ?? null,
    });
  }
  return segments.filter((s) => s.text.length > 0);
}
```

Run: `pnpm vitest run src/app/npf/format.test.ts` → PASS

- [ ] **Step 4: NpfContent の失敗するテストを書く**

`src/app/npf/NpfContent.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NpfContent } from "./NpfContent";

describe("NpfContent", () => {
  it("text ブロックを段落として描画する", () => {
    render(<NpfContent blocks={[{ type: "text", text: "hello" }]} />);
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("heading1 subtype は見出しになる", () => {
    render(<NpfContent blocks={[{ type: "text", text: "title", subtype: "heading1" }]} />);
    expect(screen.getByRole("heading")).toHaveTextContent("title");
  });

  it("image ブロックは最大幅のメディアを img で描画する", () => {
    render(
      <NpfContent
        blocks={[
          {
            type: "image",
            media: [
              { url: "https://img/small", width: 250 },
              { url: "https://img/big", width: 1280 },
            ],
            alt_text: "a cat",
          },
        ]}
      />,
    );
    expect(screen.getByAltText("a cat")).toHaveAttribute("src", "https://img/big");
  });

  it("link ブロックはアンカーになる", () => {
    render(<NpfContent blocks={[{ type: "link", url: "https://x", title: "X" }]} />);
    expect(screen.getByRole("link", { name: "X" })).toHaveAttribute("href", "https://x");
  });

  it("link スパン付きテキストはアンカーを含む", () => {
    render(
      <NpfContent
        blocks={[
          {
            type: "text",
            text: "go here",
            formatting: [{ start: 3, end: 7, type: "link", url: "https://y" }],
          },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: "here" })).toHaveAttribute("href", "https://y");
  });

  it("video ブロックは media があれば video 要素になる", () => {
    const { container } = render(
      <NpfContent blocks={[{ type: "video", media: { url: "https://v/mp4" } }]} />,
    );
    expect(container.querySelector("video")).toHaveAttribute("src", "https://v/mp4");
  });
});
```

- [ ] **Step 5: テストが失敗することを確認**

Run: `pnpm vitest run src/app/npf/NpfContent.test.tsx`
Expected: FAIL

- [ ] **Step 6: NpfContent を実装**

`src/app/npf/NpfContent.tsx`:

```tsx
import type {
  NpfAudioBlock,
  NpfBlock,
  NpfImageBlock,
  NpfLinkBlock,
  NpfTextBlock,
  NpfVideoBlock,
} from "../../shared/types";
import { applyFormatting } from "./format";

export function NpfContent({ blocks }: { blocks: NpfBlock[] }) {
  return (
    <>
      {blocks.map((block, i) => (
        // NPFブロックは安定IDを持たないため index キー
        // biome-ignore lint/suspicious/noArrayIndexKey: 順序固定の静的リスト
        <NpfBlockView key={i} block={block} />
      ))}
    </>
  );
}

function NpfBlockView({ block }: { block: NpfBlock }) {
  switch (block.type) {
    case "text":
      return <TextBlock block={block} />;
    case "image":
      return <ImageBlock block={block} />;
    case "link":
      return <LinkBlock block={block} />;
    case "video":
      return <VideoBlock block={block} />;
    case "audio":
      return <AudioBlock block={block} />;
    default:
      return null;
  }
}

function Segments({ block }: { block: NpfTextBlock }) {
  return (
    <>
      {applyFormatting(block.text, block.formatting).map((seg, i) => {
        let node = <>{seg.text}</>;
        if (seg.bold) node = <strong>{node}</strong>;
        if (seg.italic) node = <em>{node}</em>;
        if (seg.href) {
          node = (
            <a href={seg.href} target="_blank" rel="noopener noreferrer">
              {node}
            </a>
          );
        }
        // biome-ignore lint/suspicious/noArrayIndexKey: 順序固定の静的リスト
        return <span key={i}>{node}</span>;
      })}
    </>
  );
}

function TextBlock({ block }: { block: NpfTextBlock }) {
  switch (block.subtype) {
    case "heading1":
      return (
        <h2>
          <Segments block={block} />
        </h2>
      );
    case "heading2":
      return (
        <h3>
          <Segments block={block} />
        </h3>
      );
    case "quote":
    case "indented":
      return (
        <blockquote>
          <Segments block={block} />
        </blockquote>
      );
    case "chat":
      return (
        <pre className="npf-chat">
          <Segments block={block} />
        </pre>
      );
    case "ordered-list-item":
      return (
        <ol>
          <li>
            <Segments block={block} />
          </li>
        </ol>
      );
    case "unordered-list-item":
      return (
        <ul>
          <li>
            <Segments block={block} />
          </li>
        </ul>
      );
    default:
      return (
        <p>
          <Segments block={block} />
        </p>
      );
  }
}

function ImageBlock({ block }: { block: NpfImageBlock }) {
  const best = [...block.media].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
  if (!best) return null;
  return <img src={best.url} alt={block.alt_text ?? ""} loading="lazy" />;
}

function LinkBlock({ block }: { block: NpfLinkBlock }) {
  return (
    <div className="npf-link">
      <a href={block.url} target="_blank" rel="noopener noreferrer">
        {block.title ?? block.url}
      </a>
      {block.description ? <p>{block.description}</p> : null}
    </div>
  );
}

function VideoBlock({ block }: { block: NpfVideoBlock }) {
  if (block.media?.url) {
    // biome-ignore lint/a11y/useMediaCaption: Tumblrのメディアに字幕トラックは無い
    return <video controls src={block.media.url} poster={block.poster?.[0]?.url} />;
  }
  if (block.embed_iframe?.url) {
    return (
      <iframe
        src={block.embed_iframe.url}
        title="embedded video"
        width={block.embed_iframe.width}
        height={block.embed_iframe.height}
        allowFullScreen
      />
    );
  }
  if (block.url) {
    return (
      <a href={block.url} target="_blank" rel="noopener noreferrer">
        {block.url}
      </a>
    );
  }
  return null;
}

function AudioBlock({ block }: { block: NpfAudioBlock }) {
  const label = [block.artist, block.title].filter(Boolean).join(" — ");
  if (block.media?.url) {
    return (
      <figure className="npf-audio">
        {label ? <figcaption>{label}</figcaption> : null}
        {/* biome-ignore lint/a11y/useMediaCaption: Tumblrのメディアに字幕トラックは無い */}
        <audio controls src={block.media.url} />
      </figure>
    );
  }
  if (block.url) {
    return (
      <a href={block.url} target="_blank" rel="noopener noreferrer">
        {label || block.url}
      </a>
    );
  }
  return null;
}
```

- [ ] **Step 7: テストが通ることを確認**

Run: `pnpm test`
Expected: 全テスト PASS

- [ ] **Step 8: コミット**

```bash
git add src/app/npf/
git commit -m "feat: add NPF content renderer"
```

---

### Task 9: フィード UI(PostCard + 無限スクロール)

**Files:**
- Create: `src/app/hooks/useFeed.ts`, `src/app/components/PostCard.tsx`, `src/app/components/Feed.tsx`
- Modify: `src/app/App.tsx`(仮 div を `<Feed me={auth.me} />` に置換)
- Test: `src/app/hooks/useFeed.test.ts`, `src/app/components/PostCard.test.tsx`

**Interfaces:**
- Consumes: `fetchFeed`(Task 7)、`NpfContent`(Task 8)、`FeedPost`
- Produces:
  - `useFeed(): { posts: FeedPost[]; loading: boolean; loadMore: () => Promise<void>; reroll: () => Promise<void> }`
  - `<PostCard post={FeedPost} focused={boolean} onLike={() => void} onReblog={() => void} onReblogDialog={() => void} />`
  - `<Feed me={Me} />` — ルート要素に `data-testid="feed"`。番兵要素の IntersectionObserver で `loadMore`。同一ポスト再出現があるため React key は `` `${post.id}:${index}` ``。
  - Task 10 が Feed 内にキーボード操作を、Task 11 が onLike/onReblog の実体を足す。このタスクではハンドラは空実装でよい。

- [ ] **Step 1: useFeed の失敗するテストを書く**

`src/app/hooks/useFeed.test.ts`:

```ts
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FeedPost } from "../../shared/types";
import { useFeed } from "./useFeed";

const post = (id: string): FeedPost => ({
  id,
  blogName: "b",
  postUrl: `https://b.tumblr.com/post/${id}`,
  timestamp: 1_500_000_000,
  tags: [],
  reblogKey: "rk",
  liked: false,
  kind: "text",
  content: [{ type: "text", text: id }],
  trail: [],
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFeedBatches(batches: FeedPost[][]) {
  let call = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ posts: batches[Math.min(call++, batches.length - 1)] })),
  );
}

describe("useFeed", () => {
  it("loadMore でポストが末尾に追記される", async () => {
    stubFeedBatches([[post("1")], [post("2")]]);
    const { result } = renderHook(() => useFeed());
    await act(() => result.current.loadMore());
    await act(() => result.current.loadMore());
    expect(result.current.posts.map((p) => p.id)).toEqual(["1", "2"]);
  });

  it("ロード中の loadMore は多重発火しない", async () => {
    stubFeedBatches([[post("1")]]);
    const { result } = renderHook(() => useFeed());
    await act(async () => {
      await Promise.all([result.current.loadMore(), result.current.loadMore()]);
    });
    expect(vi.mocked(fetch).mock.calls.length).toBe(1);
  });

  it("reroll は既存ポストを捨てて取り直す", async () => {
    stubFeedBatches([[post("1")], [post("2")]]);
    const { result } = renderHook(() => useFeed());
    await act(() => result.current.loadMore());
    await act(() => result.current.reroll());
    await waitFor(() => {
      expect(result.current.posts.map((p) => p.id)).toEqual(["2"]);
    });
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm vitest run src/app/hooks/useFeed.test.ts`
Expected: FAIL

- [ ] **Step 3: useFeed を実装**

`src/app/hooks/useFeed.ts`:

```ts
import { useCallback, useRef, useState } from "react";
import type { FeedPost } from "../../shared/types";
import { fetchFeed } from "../api";

export function useFeed() {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);

  const loadMore = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const batch = await fetchFeed();
      setPosts((prev) => [...prev, ...batch]);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  const reroll = useCallback(async () => {
    setPosts([]);
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const batch = await fetchFeed();
      setPosts(batch);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  return { posts, loading, loadMore, reroll };
}
```

Run: `pnpm vitest run src/app/hooks/useFeed.test.ts` → PASS

- [ ] **Step 4: PostCard の失敗するテストを書く**

`src/app/components/PostCard.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { FeedPost } from "../../shared/types";
import { PostCard } from "./PostCard";

const basePost: FeedPost = {
  id: "1",
  blogName: "reblogger",
  postUrl: "https://reblogger.tumblr.com/post/1",
  timestamp: 1_183_000_000,
  tags: ["summer", "2007"],
  reblogKey: "rk",
  liked: false,
  kind: "text",
  content: [{ type: "text", text: "my comment" }],
  trail: [{ blogName: "origin", content: [{ type: "text", text: "original text" }] }],
};

const noop = () => {};

function renderCard(post: FeedPost, focused = false) {
  return render(
    <PostCard
      post={post}
      focused={focused}
      onLike={noop}
      onReblog={noop}
      onReblogDialog={noop}
    />,
  );
}

describe("PostCard", () => {
  it("ブログ名を表示する", () => {
    renderCard(basePost);
    expect(screen.getByText("reblogger")).toBeInTheDocument();
  });

  it("trail の元ポストが先に表示される", () => {
    renderCard(basePost);
    expect(screen.getByText("original text")).toBeInTheDocument();
  });

  it("タグが # 付きで表示される", () => {
    renderCard(basePost);
    expect(screen.getByText("#summer")).toBeInTheDocument();
  });

  it("focused のときは focused クラスが付く", () => {
    renderCard(basePost, true);
    expect(screen.getByRole("article")).toHaveClass("focused");
  });

  it("投稿年が表示される", () => {
    renderCard(basePost);
    expect(screen.getByText(/2007/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: テストが失敗することを確認**

Run: `pnpm vitest run src/app/components/PostCard.test.tsx`
Expected: FAIL

- [ ] **Step 6: PostCard と Feed を実装**

`src/app/components/PostCard.tsx`:

```tsx
import type { FeedPost } from "../../shared/types";
import { NpfContent } from "../npf/NpfContent";

type Props = {
  post: FeedPost;
  focused: boolean;
  onLike: () => void;
  onReblog: () => void;
  onReblogDialog: () => void;
};

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function PostCard({ post, focused, onLike, onReblog, onReblogDialog }: Props) {
  return (
    <article className={`post-card${focused ? " focused" : ""}`}>
      <header className="post-header">
        <span className="post-blog-name">{post.blogName}</span>
        <a
          className="post-date"
          href={post.postUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {formatDate(post.timestamp)}
        </a>
      </header>
      {post.trail.map((item, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: trail は順序固定
        <section className="trail-item" key={i}>
          <h4 className="trail-blog-name">{item.blogName}</h4>
          <NpfContent blocks={item.content} />
        </section>
      ))}
      {post.content.length > 0 ? (
        <section className="own-content">
          <NpfContent blocks={post.content} />
        </section>
      ) : null}
      <footer className="post-footer">
        <div className="post-tags">
          {post.tags.map((tag) => (
            <span className="post-tag" key={tag}>
              #{tag}
            </span>
          ))}
        </div>
        <div className="post-actions">
          <button type="button" onClick={onLike} aria-label="like">
            {post.liked ? "♥" : "♡"}
          </button>
          <button type="button" onClick={onReblog} aria-label="reblog">
            ⟳
          </button>
          <button type="button" onClick={onReblogDialog} aria-label="reblog with comment">
            ⟳+
          </button>
        </div>
      </footer>
    </article>
  );
}
```

`src/app/components/Feed.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import type { Me } from "../../shared/types";
import { useFeed } from "../hooks/useFeed";
import { PostCard } from "./PostCard";

export function Feed({ me }: { me: Me }) {
  const { posts, loading, loadMore, reroll } = useFeed();
  const [focusedIndex, setFocusedIndex] = useState(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadMore();
  }, [loadMore]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMore();
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  return (
    <div data-testid="feed" className="feed">
      <header className="feed-header">
        <h1>endless endless summer</h1>
        <span className="feed-user">{me.userName}</span>
      </header>
      <main className="feed-posts">
        {posts.map((post, index) => (
          <PostCard
            key={`${post.id}:${index}`}
            post={post}
            focused={index === focusedIndex}
            onLike={() => {}}
            onReblog={() => {}}
            onReblogDialog={() => {}}
          />
        ))}
        <div ref={sentinelRef} className="feed-sentinel">
          {loading ? "loading…" : ""}
        </div>
      </main>
    </div>
  );
}
```

※ `focusedIndex`/`setFocusedIndex`/`reroll` は Task 10 でキーボードに結線する。

`src/app/App.tsx` の authed 分岐を差し替え:

```tsx
import { Feed } from "./components/Feed";
// ...
if (auth.status === "loading") return null;
if (auth.status === "anonymous") return <LoginScreen />;
return <Feed me={auth.me} />;
```

- [ ] **Step 7: テストが通ることを確認**

Run: `pnpm test`
Expected: 全テスト PASS(App.test.tsx の feed テストも `data-testid="feed"` で通る)

- [ ] **Step 8: 動作確認とコミット**

`pnpm dev` を起動し、ログイン前画面が出ることを確認(この時点では Tumblr アプリ未登録のためログインは Task 15 まで通らない。それで正常)。

```bash
git add src/app/hooks/useFeed.ts src/app/hooks/useFeed.test.ts src/app/components/ src/app/App.tsx
git commit -m "feat: add feed UI with infinite scroll"
```

---

### Task 10: キーボードナビゲーション + ヘルプオーバーレイ

**Files:**
- Create: `src/app/shortcuts.ts`, `src/app/hooks/useShortcuts.ts`, `src/app/components/HelpOverlay.tsx`
- Modify: `src/app/components/Feed.tsx`
- Test: `src/app/shortcuts.test.ts`, `src/app/components/Feed.test.tsx`

**Interfaces:**
- Consumes: `useFeed`, `Feed`(Task 9)
- Produces:
  - `type ShortcutAction = "next" | "prev" | "like" | "reblog" | "reblogDialog" | "open" | "reroll" | "help"`
  - `resolveShortcut(e: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean }): ShortcutAction | null`(純粋関数。`shift+t` はブラウザが `key: "T"` を渡すので shiftKey は見ない)
  - `useShortcuts(handler: (action: ShortcutAction) => void, enabled: boolean): void` — window keydown を購読。input/textarea/select/contenteditable 内では発火しない。
  - Feed 内: `next`/`prev` で `focusedIndex` を増減し `scrollIntoView({ block: "center", behavior: "smooth" })`、`open` で `window.open(post.postUrl)`、`reroll` で `reroll()`、`help` でオーバーレイをトグル。ダイアログ表示中(Task 12)は `enabled: false` にする。

- [ ] **Step 1: resolveShortcut の失敗するテストを書く**

`src/app/shortcuts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveShortcut } from "./shortcuts";

const key = (k: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean }> = {}) => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  ...mods,
});

describe("resolveShortcut", () => {
  it("j は next", () => {
    expect(resolveShortcut(key("j"))).toBe("next");
  });

  it("k は prev", () => {
    expect(resolveShortcut(key("k"))).toBe("prev");
  });

  it("t は reblog", () => {
    expect(resolveShortcut(key("t"))).toBe("reblog");
  });

  it("T(shift+t)は reblogDialog", () => {
    expect(resolveShortcut(key("T"))).toBe("reblogDialog");
  });

  it("l は like", () => {
    expect(resolveShortcut(key("l"))).toBe("like");
  });

  it("o は open", () => {
    expect(resolveShortcut(key("o"))).toBe("open");
  });

  it("r は reroll", () => {
    expect(resolveShortcut(key("r"))).toBe("reroll");
  });

  it("? は help", () => {
    expect(resolveShortcut(key("?"))).toBe("help");
  });

  it("cmd+r のような修飾キー付きは無視する", () => {
    expect(resolveShortcut(key("r", { metaKey: true }))).toBeNull();
  });

  it("未定義キーは null", () => {
    expect(resolveShortcut(key("x"))).toBeNull();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm vitest run src/app/shortcuts.test.ts`
Expected: FAIL

- [ ] **Step 3: resolveShortcut と useShortcuts を実装**

`src/app/shortcuts.ts`:

```ts
export type ShortcutAction =
  | "next"
  | "prev"
  | "like"
  | "reblog"
  | "reblogDialog"
  | "open"
  | "reroll"
  | "help";

type KeyEventLike = { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean };

const MAP: Record<string, ShortcutAction> = {
  j: "next",
  k: "prev",
  t: "reblog",
  T: "reblogDialog",
  l: "like",
  o: "open",
  r: "reroll",
  "?": "help",
};

export function resolveShortcut(e: KeyEventLike): ShortcutAction | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  return MAP[e.key] ?? null;
}
```

`src/app/hooks/useShortcuts.ts`:

```ts
import { useEffect } from "react";
import { type ShortcutAction, resolveShortcut } from "../shortcuts";

export function useShortcuts(
  handler: (action: ShortcutAction) => void,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      const action = resolveShortcut(e);
      if (!action) return;
      e.preventDefault();
      handler(action);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handler, enabled]);
}
```

Run: `pnpm vitest run src/app/shortcuts.test.ts` → PASS

- [ ] **Step 4: Feed のキーボード操作の失敗するテストを書く**

`src/app/components/Feed.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FeedPost } from "../../shared/types";
import { Feed } from "./Feed";

const post = (id: string): FeedPost => ({
  id,
  blogName: `blog-${id}`,
  postUrl: `https://blog.tumblr.com/post/${id}`,
  timestamp: 1_500_000_000,
  tags: [],
  reblogKey: "rk",
  liked: false,
  kind: "text",
  content: [{ type: "text", text: `post ${id}` }],
  trail: [],
});

const me = { userName: "u", blogs: [] };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Feed keyboard", () => {
  it("j で次のポストにフォーカスが移る", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ posts: [post("1"), post("2")] })),
    );
    Element.prototype.scrollIntoView = vi.fn();
    render(<Feed me={me} />);
    await screen.findByText("post 1");
    await userEvent.keyboard("j");
    const articles = screen.getAllByRole("article");
    expect(articles[1]).toHaveClass("focused");
  });

  it("? でヘルプオーバーレイが開く", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ posts: [post("1")] })));
    render(<Feed me={me} />);
    await screen.findByText("post 1");
    await userEvent.keyboard("?");
    await waitFor(() => {
      expect(screen.getByText("Keyboard shortcuts")).toBeInTheDocument();
    });
  });
});
```

※ `pnpm add -D @testing-library/user-event` を忘れずに。

- [ ] **Step 5: テストが失敗することを確認**

Run: `pnpm vitest run src/app/components/Feed.test.tsx`
Expected: FAIL

- [ ] **Step 6: Feed に結線 + HelpOverlay 実装**

`src/app/components/HelpOverlay.tsx`:

```tsx
const SHORTCUTS: [string, string][] = [
  ["j / k", "next / previous post"],
  ["t", "reblog instantly"],
  ["shift+t", "reblog with comment"],
  ["l", "like / unlike"],
  ["o", "open original post"],
  ["r", "reroll the whole feed"],
  ["?", "toggle this help"],
];

export function HelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: 閉じる操作は ? キーでも可能
    <div className="help-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="help-panel">
        <h2>Keyboard shortcuts</h2>
        <dl>
          {SHORTCUTS.map(([keys, description]) => (
            <div className="help-row" key={keys}>
              <dt>
                <kbd>{keys}</kbd>
              </dt>
              <dd>{description}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
```

`src/app/components/Feed.tsx` を修正(全体):

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import type { Me } from "../../shared/types";
import { useFeed } from "../hooks/useFeed";
import { useShortcuts } from "../hooks/useShortcuts";
import type { ShortcutAction } from "../shortcuts";
import { HelpOverlay } from "./HelpOverlay";
import { PostCard } from "./PostCard";

export function Feed({ me }: { me: Me }) {
  const { posts, loading, loadMore, reroll } = useFeed();
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    loadMore();
  }, [loadMore]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMore();
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  const focusPost = useCallback((index: number) => {
    setFocusedIndex(index);
    cardRefs.current[index]?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, []);

  const handleAction = useCallback(
    (action: ShortcutAction) => {
      const post = posts[focusedIndex];
      switch (action) {
        case "next":
          if (focusedIndex < posts.length - 1) focusPost(focusedIndex + 1);
          break;
        case "prev":
          if (focusedIndex > 0) focusPost(focusedIndex - 1);
          break;
        case "open":
          if (post) window.open(post.postUrl, "_blank", "noopener");
          break;
        case "reroll":
          setFocusedIndex(0);
          reroll();
          break;
        case "help":
          setHelpOpen((open) => !open);
          break;
        default:
          // like / reblog / reblogDialog は Task 11-12 で結線
          break;
      }
    },
    [posts, focusedIndex, focusPost, reroll],
  );

  useShortcuts(handleAction, !helpOpen || true);

  return (
    <div data-testid="feed" className="feed">
      <header className="feed-header">
        <h1>endless endless summer</h1>
        <span className="feed-user">{me.userName}</span>
      </header>
      <main className="feed-posts">
        {posts.map((post, index) => (
          <div
            key={`${post.id}:${index}`}
            ref={(el) => {
              cardRefs.current[index] = el;
            }}
          >
            <PostCard
              post={post}
              focused={index === focusedIndex}
              onLike={() => {}}
              onReblog={() => {}}
              onReblogDialog={() => {}}
            />
          </div>
        ))}
        <div ref={sentinelRef} className="feed-sentinel">
          {loading ? "loading…" : ""}
        </div>
      </main>
      {helpOpen ? <HelpOverlay onClose={() => setHelpOpen(false)} /> : null}
    </div>
  );
}
```

※ `useShortcuts(handleAction, !helpOpen || true)` はヘルプ表示中も `?` で閉じられるよう常時 true(ダイアログ表示中の無効化は Task 12 で行う)。

- [ ] **Step 7: テストが通ることを確認**

Run: `pnpm test`
Expected: 全テスト PASS

- [ ] **Step 8: コミット**

```bash
git add src/app/shortcuts.ts src/app/shortcuts.test.ts src/app/hooks/useShortcuts.ts src/app/components/
git commit -m "feat: add keyboard navigation and help overlay"
```

---

### Task 11: like / 即リブログ(API + キー結線 + トースト)

**Files:**
- Create: `src/app/components/Toast.tsx`
- Modify: `src/worker/api.ts`(/api/like, /api/reblog)、`src/app/components/Feed.tsx`(l / t 結線)
- Test: `src/worker/api.test.ts`, Modify: `src/app/components/Feed.test.tsx`

**Interfaces:**
- Consumes: `TumblrClient.like/unlike/reblog`(Task 3)、`clientForSession`(Task 5)、`likePost`/`reblogPost`(Task 7)
- Produces:
  - HTTP 契約: `POST /api/like` body `{ id, reblogKey, like: boolean }` → `{ ok: true }`。`POST /api/reblog` body `{ id, reblogKey, blogName?, comment?, tags? }`(blogName 省略時はセッションのプライマリブログ)→ `{ ok: true }`
  - `<Toast message={string | null} />` と Feed 内 `showToast(message: string)`(2 秒で消える)
  - Feed: `l` で like/unlike トグル(posts 配列の `liked` を楽観更新)、`t` で即リブログ + トースト "Reblogged to {blog}"

- [ ] **Step 1: worker 側の失敗するテストを書く**

`src/worker/api.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { type Session, SessionStore } from "./session";
import { FakeKV, fakeFetch } from "./test-helpers";

const session: Session = {
  tokens: { accessToken: "at", refreshToken: "rt", expiresAt: 9_999_999_999 },
  userName: "u",
  blogs: [
    { name: "secondary", title: "2nd", primary: false, uuid: "uuid-2" },
    { name: "mainblog", title: "Main", primary: true, uuid: "uuid-1" },
  ],
};

async function authedRequest(
  path: string,
  body: unknown,
  tumblrFetch: ReturnType<typeof fakeFetch>,
) {
  const kv = new FakeKV();
  const sid = await new SessionStore(kv as unknown as KVNamespace).create(session);
  const app = createApp({ fetchFn: tumblrFetch });
  return app.request(
    path,
    {
      method: "POST",
      headers: { Cookie: `sid=${sid}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    { KV: kv, TUMBLR_CLIENT_ID: "cid", TUMBLR_CLIENT_SECRET: "sec" },
  );
}

describe("POST /api/like", () => {
  it("like=true なら /v2/user/like を呼ぶ", async () => {
    const tumblr = fakeFetch({ "/v2/user/like": { response: {} } });
    const res = await authedRequest("/api/like", { id: "1", reblogKey: "rk", like: true }, tumblr);
    expect(res.status).toBe(200);
    expect(new URL(tumblr.calls[0].url).pathname).toBe("/v2/user/like");
  });

  it("like=false なら /v2/user/unlike を呼ぶ", async () => {
    const tumblr = fakeFetch({ "/v2/user/unlike": { response: {} } });
    await authedRequest("/api/like", { id: "1", reblogKey: "rk", like: false }, tumblr);
    expect(new URL(tumblr.calls[0].url).pathname).toBe("/v2/user/unlike");
  });
});

describe("POST /api/reblog", () => {
  it("blogName 省略時はプライマリブログにリブログする", async () => {
    const tumblr = fakeFetch({ "/v2/blog/mainblog/post/reblog": { response: {} } });
    const res = await authedRequest("/api/reblog", { id: "1", reblogKey: "rk" }, tumblr);
    expect(res.status).toBe(200);
    expect(new URL(tumblr.calls[0].url).pathname).toBe("/v2/blog/mainblog/post/reblog");
  });

  it("blogName 指定時はそのブログにリブログする", async () => {
    const tumblr = fakeFetch({ "/v2/blog/secondary/post/reblog": { response: {} } });
    await authedRequest(
      "/api/reblog",
      { id: "1", reblogKey: "rk", blogName: "secondary", comment: "c", tags: "a,b" },
      tumblr,
    );
    expect(new URL(tumblr.calls[0].url).pathname).toBe("/v2/blog/secondary/post/reblog");
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm vitest run src/worker/api.test.ts`
Expected: FAIL(404)

- [ ] **Step 3: worker 実装**

`src/worker/api.ts` の `registerApiRoutes` に追加:

```ts
app.post("/api/like", requireSession(), async (c) => {
  const { id, reblogKey, like } = await c.req.json<{
    id: string;
    reblogKey: string;
    like: boolean;
  }>();
  const client = clientForSession(c, deps);
  if (like) {
    await client.like(id, reblogKey);
  } else {
    await client.unlike(id, reblogKey);
  }
  return c.json({ ok: true });
});

app.post("/api/reblog", requireSession(), async (c) => {
  const { id, reblogKey, blogName, comment, tags } = await c.req.json<{
    id: string;
    reblogKey: string;
    blogName?: string;
    comment?: string;
    tags?: string;
  }>();
  const session = c.get("session");
  const target = blogName ?? session.blogs.find((b) => b.primary)?.name;
  if (!target) return c.json({ error: "no target blog" }, 400);
  const client = clientForSession(c, deps);
  await client.reblog(target, { id, reblogKey: reblogKey, comment, tags });
  return c.json({ ok: true });
});
```

Run: `pnpm vitest run src/worker/api.test.ts` → PASS

- [ ] **Step 4: フロントの失敗するテストを書く**

`src/app/components/Feed.test.tsx` に追記:

```tsx
describe("Feed actions", () => {
  it("l で /api/like が呼ばれ liked が楽観更新される", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/feed")) return Response.json({ posts: [post("1")] });
      return Response.json({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Feed me={me} />);
    await screen.findByText("post 1");
    await userEvent.keyboard("l");
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/api/like"))).toBe(true);
    });
    expect(screen.getByRole("button", { name: "like" })).toHaveTextContent("♥");
  });

  it("t で /api/reblog が呼ばれトーストが出る", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/feed")) return Response.json({ posts: [post("1")] });
      return Response.json({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Feed me={{ userName: "u", blogs: [{ name: "mainblog", title: "M", primary: true, uuid: "x" }] }} />);
    await screen.findByText("post 1");
    await userEvent.keyboard("t");
    await waitFor(() => {
      expect(screen.getByText("Reblogged to mainblog")).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 5: テストが失敗することを確認**

Run: `pnpm vitest run src/app/components/Feed.test.tsx`
Expected: 新規 2 件が FAIL

- [ ] **Step 6: フロント実装**

`src/app/components/Toast.tsx`:

```tsx
export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <output className="toast" aria-live="polite">
      {message}
    </output>
  );
}
```

`src/app/components/Feed.tsx` を修正(追加・変更点):

```tsx
import { likePost, reblogPost } from "../api";
import { Toast } from "./Toast";
import type { FeedPost } from "../../shared/types";

// Feed コンポーネント内に追加
const [postOverrides, setPostOverrides] = useState<Record<number, Partial<FeedPost>>>({});
const [toast, setToast] = useState<string | null>(null);
const toastTimer = useRef<ReturnType<typeof setTimeout>>();

const showToast = useCallback((message: string) => {
  setToast(message);
  clearTimeout(toastTimer.current);
  toastTimer.current = setTimeout(() => setToast(null), 2000);
}, []);

const viewPost = useCallback(
  (index: number): FeedPost | undefined =>
    posts[index] ? { ...posts[index], ...postOverrides[index] } : undefined,
  [posts, postOverrides],
);

const toggleLike = useCallback(
  (index: number) => {
    const post = viewPost(index);
    if (!post) return;
    const nextLiked = !post.liked;
    setPostOverrides((prev) => ({ ...prev, [index]: { ...prev[index], liked: nextLiked } }));
    likePost(post.id, post.reblogKey, nextLiked).catch(() => {
      setPostOverrides((prev) => ({ ...prev, [index]: { ...prev[index], liked: !nextLiked } }));
      showToast("Like failed");
    });
  },
  [viewPost, showToast],
);

const instantReblog = useCallback(
  (index: number) => {
    const post = viewPost(index);
    if (!post) return;
    const primary = me.blogs.find((b) => b.primary)?.name ?? "";
    reblogPost({ id: post.id, reblogKey: post.reblogKey })
      .then(() => showToast(`Reblogged to ${primary}`))
      .catch(() => showToast("Reblog failed"));
  },
  [viewPost, me.blogs, showToast],
);

// handleAction の switch に追加
case "like":
  toggleLike(focusedIndex);
  break;
case "reblog":
  instantReblog(focusedIndex);
  break;

// JSX: PostCard の props を結線し、viewPost を渡す
<PostCard
  post={viewPost(index) ?? post}
  focused={index === focusedIndex}
  onLike={() => toggleLike(index)}
  onReblog={() => instantReblog(index)}
  onReblogDialog={() => {}}
/>
// JSX 末尾(HelpOverlay の隣)に
<Toast message={toast} />
```

※ 重複ポスト対策で楽観更新はポスト ID でなく **index** をキーにする(同じ ID が 2 箇所にあってもフォーカス中の 1 枚だけ変わる)。

- [ ] **Step 7: テストが通ることを確認**

Run: `pnpm test`
Expected: 全テスト PASS

- [ ] **Step 8: コミット**

```bash
git add src/worker/api.ts src/worker/api.test.ts src/app/components/
git commit -m "feat: add like and instant reblog with keyboard bindings"
```

---

### Task 12: リブログダイアログ(shift+t)

**Files:**
- Create: `src/app/components/ReblogDialog.tsx`
- Modify: `src/app/components/Feed.tsx`
- Test: `src/app/components/ReblogDialog.test.tsx`

**Interfaces:**
- Consumes: `reblogPost`(Task 7)、`MeBlog`(shared types)、Feed の `handleAction`(Task 10, 11)
- Produces: `<ReblogDialog post={FeedPost} blogs={MeBlog[]} onSubmit={(input: { blogName: string; comment: string; tags: string }) => void} onClose={() => void} />`
  - コメント textarea、タグ input(カンマ区切り)、投稿先 select(デフォルトはプライマリ)。
  - `Esc` で閉じる。`cmd/ctrl+Enter` で送信。
  - ダイアログ表示中は Feed の `useShortcuts` を `enabled: false` にする。

- [ ] **Step 1: 失敗するテストを書く**

`src/app/components/ReblogDialog.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { FeedPost, MeBlog } from "../../shared/types";
import { ReblogDialog } from "./ReblogDialog";

const post: FeedPost = {
  id: "1",
  blogName: "b",
  postUrl: "https://b.tumblr.com/post/1",
  timestamp: 1_500_000_000,
  tags: [],
  reblogKey: "rk",
  liked: false,
  kind: "text",
  content: [{ type: "text", text: "content" }],
  trail: [],
};

const blogs: MeBlog[] = [
  { name: "secondary", title: "2nd", primary: false, uuid: "u2" },
  { name: "mainblog", title: "Main", primary: true, uuid: "u1" },
];

describe("ReblogDialog", () => {
  it("投稿先はプライマリブログがデフォルト", () => {
    render(<ReblogDialog post={post} blogs={blogs} onSubmit={() => {}} onClose={() => {}} />);
    expect(screen.getByRole("combobox")).toHaveValue("mainblog");
  });

  it("送信でコメント・タグ・投稿先が渡る", async () => {
    const onSubmit = vi.fn();
    render(<ReblogDialog post={post} blogs={blogs} onSubmit={onSubmit} onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText("Comment"), "nice");
    await userEvent.type(screen.getByLabelText("Tags"), "a, b");
    await userEvent.selectOptions(screen.getByRole("combobox"), "secondary");
    await userEvent.click(screen.getByRole("button", { name: "Reblog" }));
    expect(onSubmit).toHaveBeenCalledWith({
      blogName: "secondary",
      comment: "nice",
      tags: "a, b",
    });
  });

  it("Esc で onClose が呼ばれる", async () => {
    const onClose = vi.fn();
    render(<ReblogDialog post={post} blogs={blogs} onSubmit={() => {}} onClose={onClose} />);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm vitest run src/app/components/ReblogDialog.test.tsx`
Expected: FAIL

- [ ] **Step 3: 実装**

`src/app/components/ReblogDialog.tsx`:

```tsx
import { useEffect, useId, useState } from "react";
import type { FeedPost, MeBlog } from "../../shared/types";

type Props = {
  post: FeedPost;
  blogs: MeBlog[];
  onSubmit: (input: { blogName: string; comment: string; tags: string }) => void;
  onClose: () => void;
};

export function ReblogDialog({ post, blogs, onSubmit, onClose }: Props) {
  const [blogName, setBlogName] = useState(
    blogs.find((b) => b.primary)?.name ?? blogs[0]?.name ?? "",
  );
  const [comment, setComment] = useState("");
  const [tags, setTags] = useState("");
  const commentId = useId();
  const tagsId = useId();

  const submit = () => onSubmit({ blogName, comment, tags });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true">
      <div className="reblog-dialog">
        <h2>Reblog from {post.blogName}</h2>
        <label htmlFor={commentId}>Comment</label>
        <textarea
          id={commentId}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          // biome-ignore lint/a11y/noAutofocus: キーボード操作フローの起点
          autoFocus
        />
        <label htmlFor={tagsId}>Tags</label>
        <input
          id={tagsId}
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="comma, separated, tags"
        />
        <select value={blogName} onChange={(e) => setBlogName(e.target.value)}>
          {blogs.map((blog) => (
            <option key={blog.uuid} value={blog.name}>
              {blog.name}
            </option>
          ))}
        </select>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={submit}>
            Reblog
          </button>
        </div>
      </div>
    </div>
  );
}
```

`src/app/components/Feed.tsx` に結線:

```tsx
import { ReblogDialog } from "./ReblogDialog";

// state 追加
const [dialogIndex, setDialogIndex] = useState<number | null>(null);

// handleAction の switch に追加
case "reblogDialog":
  if (viewPost(focusedIndex)) setDialogIndex(focusedIndex);
  break;

// useShortcuts の enabled をダイアログ非表示時のみに変更
useShortcuts(handleAction, dialogIndex === null);

// 送信ハンドラ
const submitDialogReblog = useCallback(
  (input: { blogName: string; comment: string; tags: string }) => {
    const post = dialogIndex !== null ? viewPost(dialogIndex) : undefined;
    if (!post) return;
    setDialogIndex(null);
    reblogPost({
      id: post.id,
      reblogKey: post.reblogKey,
      blogName: input.blogName,
      comment: input.comment || undefined,
      tags: input.tags || undefined,
    })
      .then(() => showToast(`Reblogged to ${input.blogName}`))
      .catch(() => showToast("Reblog failed"));
  },
  [dialogIndex, viewPost, showToast],
);

// JSX 末尾に追加(dialogIndex の対象ポストがあるときだけ)
{dialogIndex !== null && viewPost(dialogIndex) ? (
  <ReblogDialog
    post={viewPost(dialogIndex) as FeedPost}
    blogs={me.blogs}
    onSubmit={submitDialogReblog}
    onClose={() => setDialogIndex(null)}
  />
) : null}

// PostCard の onReblogDialog も結線
onReblogDialog={() => setDialogIndex(index)}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm test`
Expected: 全テスト PASS

- [ ] **Step 5: コミット**

```bash
git add src/app/components/ReblogDialog.tsx src/app/components/ReblogDialog.test.tsx src/app/components/Feed.tsx
git commit -m "feat: add reblog dialog with comment, tags and blog selection"
```

---

### Task 13: ポストタイプフィルタ設定

**Files:**
- Create: `src/app/settings.ts`, `src/app/components/SettingsPanel.tsx`
- Modify: `src/app/components/Feed.tsx`
- Test: `src/app/settings.test.ts`

**Interfaces:**
- Consumes: `PostKind`(shared types)、Feed(Task 9-12)
- Produces:
  - `type FilterSettings = { kinds: Record<PostKind, boolean> }`
  - `DEFAULT_SETTINGS: FilterSettings`(全 true)
  - `loadSettings(): FilterSettings` / `saveSettings(s: FilterSettings): void`(localStorage キー `ees:settings`、壊れた JSON はデフォルトにフォールバック)
  - `<SettingsPanel settings onChange onClose />` — kind ごとのチェックボックス
  - Feed: フィルタは**表示前に適用**(`posts.filter((p) => settings.kinds[p.kind])`)。j/k はフィルタ後配列に対して動く。ヘッダーに設定を開く歯車ボタン。

- [ ] **Step 1: 失敗するテストを書く**

`src/app/settings.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "./settings";

beforeEach(() => {
  localStorage.clear();
});

describe("settings", () => {
  it("保存前はデフォルト(全 kind 有効)を返す", () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("save したものが load で返る", () => {
    const s = { kinds: { ...DEFAULT_SETTINGS.kinds, video: false } };
    saveSettings(s);
    expect(loadSettings().kinds.video).toBe(false);
  });

  it("壊れた JSON はデフォルトにフォールバックする", () => {
    localStorage.setItem("ees:settings", "{broken");
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm vitest run src/app/settings.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装**

`src/app/settings.ts`:

```ts
import type { PostKind } from "../shared/types";

export type FilterSettings = { kinds: Record<PostKind, boolean> };

export const DEFAULT_SETTINGS: FilterSettings = {
  kinds: { text: true, image: true, link: true, audio: true, video: true },
};

const KEY = "ees:settings";

export function loadSettings(): FilterSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<FilterSettings>;
    return { kinds: { ...DEFAULT_SETTINGS.kinds, ...parsed.kinds } };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: FilterSettings): void {
  localStorage.setItem(KEY, JSON.stringify(settings));
}
```

`src/app/components/SettingsPanel.tsx`:

```tsx
import type { PostKind } from "../../shared/types";
import type { FilterSettings } from "../settings";

const KINDS: PostKind[] = ["text", "image", "link", "audio", "video"];

type Props = {
  settings: FilterSettings;
  onChange: (settings: FilterSettings) => void;
  onClose: () => void;
};

export function SettingsPanel({ settings, onChange, onClose }: Props) {
  return (
    <div className="settings-panel">
      <h2>Post types</h2>
      {KINDS.map((kind) => (
        <label key={kind} className="settings-row">
          <input
            type="checkbox"
            checked={settings.kinds[kind]}
            onChange={(e) =>
              onChange({ kinds: { ...settings.kinds, [kind]: e.target.checked } })
            }
          />
          {kind}
        </label>
      ))}
      <button type="button" onClick={onClose}>
        Close
      </button>
    </div>
  );
}
```

`src/app/components/Feed.tsx` に結線:

```tsx
import { loadSettings, saveSettings } from "../settings";
import { SettingsPanel } from "./SettingsPanel";

// state
const [settings, setSettings] = useState(loadSettings);
const [settingsOpen, setSettingsOpen] = useState(false);

const updateSettings = useCallback((next: FilterSettings) => {
  setSettings(next);
  saveSettings(next);
}, []);

// posts の代わりに visiblePosts を全域で使う(map、handleAction、viewPost)
const visiblePosts = useMemo(
  () => posts.filter((p) => settings.kinds[p.kind]),
  [posts, settings],
);

// ヘッダーに歯車ボタン
<button type="button" aria-label="settings" onClick={() => setSettingsOpen(true)}>
  ⚙
</button>

// JSX 末尾
{settingsOpen ? (
  <SettingsPanel
    settings={settings}
    onChange={updateSettings}
    onClose={() => setSettingsOpen(false)}
  />
) : null}
```

※ 注意: `viewPost`/`postOverrides`/`focusedIndex` の index 基準を `posts` から `visiblePosts` に統一すること。フィルタ変更時は `setFocusedIndex(0)` にリセットする。

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm test`
Expected: 全テスト PASS

- [ ] **Step 5: コミット**

```bash
git add src/app/settings.ts src/app/settings.test.ts src/app/components/SettingsPanel.tsx src/app/components/Feed.tsx
git commit -m "feat: add post type filter settings"
```

---

### Task 14: ビジュアルデザイン(Tumblr ダッシュボードへのオマージュ)

**Files:**
- Modify: `src/app/styles.css`(全面)、必要に応じ各コンポーネントの className 調整

**Interfaces:**
- Consumes: Task 7-13 の全コンポーネントの className(`post-card`, `focused`, `feed-posts`, `help-overlay`, `dialog-backdrop`, `toast`, `settings-panel`, `login-screen` など)

**実行時の注意: このタスクを実装する前に `frontend-design` スキルを必ずロードすること。** 以下はベースライン(方向性の固定)であり、スキルの指針に沿って質を上げてよい。ただしトークン(色・カラム幅)は Global Constraints に従う。

- [ ] **Step 1: ベーススタイルを書く**

`src/app/styles.css`:

```css
:root {
  --bg: #001935;
  --surface: #0f2440;
  --card: #ffffff;
  --card-text: #1a2735;
  --card-muted: #6b7b8d;
  --text: #ffffff;
  --muted: #a3b1c2;
  --accent: #00b8ff;
  --column: 540px;
  --radius: 6px;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: "Helvetica Neue", Helvetica, Arial, system-ui, sans-serif;
  line-height: 1.5;
}

/* ログイン画面 */
.login-screen {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
}

.login-button {
  background: var(--accent);
  color: var(--bg);
  font-weight: 700;
  padding: 0.75rem 2rem;
  border-radius: var(--radius);
  text-decoration: none;
}

/* フィード */
.feed-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: baseline;
  gap: 1rem;
  padding: 0.75rem 1.25rem;
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: blur(8px);
}

.feed-header h1 {
  font-size: 1rem;
  margin: 0;
}

.feed-user {
  color: var(--muted);
  font-size: 0.85rem;
  margin-left: auto;
}

.feed-posts {
  max-width: var(--column);
  margin: 0 auto;
  padding: 1.5rem 0 4rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

/* ポストカード */
.post-card {
  background: var(--card);
  color: var(--card-text);
  border-radius: var(--radius);
  overflow: hidden;
  border: 2px solid transparent;
}

.post-card.focused {
  border-color: var(--accent);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 30%, transparent);
}

.post-card img,
.post-card video,
.post-card iframe {
  max-width: 100%;
  display: block;
}

.post-header,
.post-footer,
.own-content,
.trail-item {
  padding: 0.75rem 1rem;
}

.post-header {
  display: flex;
  justify-content: space-between;
  font-weight: 700;
}

.post-date {
  color: var(--card-muted);
  font-weight: 400;
  text-decoration: none;
}

.trail-blog-name {
  margin: 0 0 0.25rem;
  font-size: 0.85rem;
  color: var(--card-muted);
}

.post-tags {
  color: var(--card-muted);
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.post-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}

.post-actions button {
  background: none;
  border: none;
  font-size: 1.1rem;
  cursor: pointer;
  color: var(--card-muted);
}

/* オーバーレイ類 */
.help-overlay,
.dialog-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 10, 25, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.help-panel,
.reblog-dialog,
.settings-panel {
  background: var(--surface);
  border-radius: var(--radius);
  padding: 1.5rem;
  min-width: 320px;
}

.reblog-dialog {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: min(90vw, 480px);
}

.reblog-dialog textarea {
  min-height: 6rem;
}

.settings-panel {
  position: fixed;
  top: 3.5rem;
  right: 1rem;
  z-index: 50;
}

.settings-row {
  display: block;
  padding: 0.25rem 0;
}

.help-row {
  display: flex;
  gap: 1rem;
  padding: 0.25rem 0;
}

kbd {
  background: var(--bg);
  border-radius: 4px;
  padding: 0.1rem 0.5rem;
  font-family: ui-monospace, monospace;
}

.toast {
  position: fixed;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  background: var(--accent);
  color: var(--bg);
  font-weight: 700;
  padding: 0.5rem 1.25rem;
  border-radius: 999px;
  z-index: 200;
}

.feed-sentinel {
  text-align: center;
  color: var(--muted);
  padding: 1rem;
}
```

- [ ] **Step 2: 目視確認**

`pnpm dev` でログイン画面・(モックデータでもよいので)フィード・ヘルプ・ダイアログの見た目を確認。`pnpm test` で既存テストが壊れていないことを確認。

- [ ] **Step 3: コミット**

```bash
git add src/app/styles.css src/app/components/
git commit -m "feat: style app as Tumblr dashboard homage"
```

---

### Task 15: デプロイと Tumblr アプリ登録(E2E 確認)

**Files:**
- Modify: `wrangler.jsonc`(KV の実 ID)、`package.json`(deploy スクリプト)
- Create: `.dev.vars`(git 管理外)

**Interfaces:**
- Consumes: すべて

- [ ] **Step 1: 【ユーザー作業】Tumblr アプリ登録**

https://www.tumblr.com/oauth/apps で新規アプリを登録してもらう。
- Default callback URL: `http://localhost:5173/auth/callback`(デプロイ後に本番 URL `https://endless-endless-summer.<subdomain>.workers.dev/auth/callback` を追加/変更)
- OAuth2 を有効にし、consumer key(= client_id)と consumer secret(= client_secret)を控える。

- [ ] **Step 2: ローカルシークレット設定**

`.dev.vars`(git 管理外):

```
TUMBLR_CLIENT_ID=<consumer key>
TUMBLR_CLIENT_SECRET=<consumer secret>
```

- [ ] **Step 3: ローカル E2E 確認**

`pnpm dev` → http://localhost:5173 で:
1. "Log in with Tumblr" → Tumblr 認可画面 → コールバックでフィードが表示される
2. j/k でフォーカス移動、様々な年のポストが出る
3. l で like(Tumblr 本家の likes ページで確認)
4. t で即リブログ(自分のブログで確認)
5. shift+t でダイアログリブログ(コメント・タグ付きで確認)
6. r でフィード全入れ替え、? でヘルプ

問題があれば `superpowers:systematic-debugging` スキルで対処。

- [ ] **Step 4: KV 作成と本番デプロイ**

```bash
pnpm wrangler kv namespace create KV
# 出力された id を wrangler.jsonc の kv_namespaces[0].id に設定
pnpm wrangler secret put TUMBLR_CLIENT_ID
pnpm wrangler secret put TUMBLR_CLIENT_SECRET
pnpm build
# @cloudflare/vite-plugin はビルド時に dist/ 配下へデプロイ用 wrangler.json を出力する。
# ビルドログに表示されるパスを使う(例):
pnpm wrangler deploy --config dist/endless-endless-summer/wrangler.json
```

- [ ] **Step 5: 【ユーザー作業】本番 callback URL 登録と本番確認**

Tumblr アプリ設定の callback URL に本番 URL を設定してもらい、本番でログイン → フィード表示 → リブログまで一通り確認。

- [ ] **Step 6: コミット**

```bash
git add wrangler.jsonc package.json
git commit -m "chore: wire production KV namespace and deploy config"
```

---

## 自己レビュー結果(作成時に確認済み)

- 仕様カバレッジ: コア体験(年均等ランダム)=Task 2/6、キーボード全 8 キー=Task 10-12、全タイプ表示+フィルタ=Task 8/13、OAuth マルチユーザー設計=Task 3-5、デザインオマージュ=Task 14。「タグ版全体モード」は v2 スコープのため対象外(feed.ts の `FeedClient` 抽象がその差し替え点)。
- 型整合: `Tokens`/`Session`/`FeedPost`/`Me` の参照はすべて Task 3/4/6 の定義に一致。`reblogKey`(camel)⇔ API の `reblog_key`(snake)は worker 境界で変換。
- 既知の簡略化(意図的): NPF layout 無視・リスト項目の個別 ul/ol 包み・`embed_html` 不使用(XSS 回避)・重複ポストの React key は index 連結で回避。
