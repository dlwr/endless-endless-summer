import type { Context, Hono } from "hono";
import type { AppDeps } from "./app";
import type { AppEnv } from "./env";
import { buildFeed } from "./feed";
import {
  DEFAULT_TRIP_SECONDS,
  RateLimitGuard,
  readRateHeaders,
} from "./ratelimit";
import { requireSession, SessionStore } from "./session";
import { TumblrClient, TumblrRateLimitError } from "./tumblr";

export function clientForSession(
  c: Context<AppEnv>,
  deps: AppDeps,
): TumblrClient {
  const session = c.get("session");
  const sid = c.get("sid");
  const store = new SessionStore(c.env.KV);
  const guard = new RateLimitGuard(c.env.KV);
  return new TumblrClient(
    session.tokens,
    {
      clientId: c.env.TUMBLR_CLIENT_ID,
      clientSecret: c.env.TUMBLR_CLIENT_SECRET,
    },
    async (tokens) => {
      await store.update(sid, { ...session, tokens });
    },
    deps.fetchFn,
    undefined,
    async (res) => {
      // 成功・失敗を問わず、Tumblr が返す x-ratelimit-* ヘッダーを読んで
      // 共有 backoff 状態を更新する(読み取り専用の /api/feed だけが check() で
      // ゲートするが、書き込み系のレスポンスからも残量は学習しておく)。
      const now = Math.floor(Date.now() / 1000);
      await guard.record(readRateHeaders(res.headers, now), now);
    },
  );
}

function rateLimitedJson(c: Context<AppEnv>, retryAt: number): Response {
  return c.json({ error: "rate_limited", retryAt }, 429);
}

export function registerApiRoutes(app: Hono<AppEnv>, deps: AppDeps): void {
  app.get("/api/me", requireSession(), (c) => {
    const session = c.get("session");
    return c.json({ userName: session.userName, blogs: session.blogs });
  });

  app.get("/api/feed", requireSession(), async (c) => {
    const guard = new RateLimitGuard(c.env.KV);
    const now = Math.floor(Date.now() / 1000);
    const backoffAt = await guard.check(now);
    if (backoffAt !== null) return rateLimitedJson(c, backoffAt);

    const client = clientForSession(c, deps);
    try {
      const posts = await buildFeed(
        client,
        c.env.KV,
        c.get("session").userName,
        Math.random,
        now,
      );
      return c.json({ posts });
    } catch (err) {
      if (err instanceof TumblrRateLimitError) {
        // ヘッダー無し 429 では record() が backoff を判断できないので、
        // 固定秒数の backoff を明示的に設定する。
        await guard.trip(now);
        return rateLimitedJson(c, now + DEFAULT_TRIP_SECONDS);
      }
      throw err;
    }
  });

  app.post("/api/like", requireSession(), async (c) => {
    const { id, reblogKey, like } = await c.req.json<{
      id: string;
      reblogKey: string;
      like: boolean;
    }>();
    const client = clientForSession(c, deps);
    try {
      if (like) {
        await client.like(id, reblogKey);
      } else {
        await client.unlike(id, reblogKey);
      }
      return c.json({ ok: true });
    } catch (err) {
      if (err instanceof TumblrRateLimitError) {
        // Tumblr の 1,000/hr 予算は全エンドポイント共有なので、
        // ヘッダー無し 429 も backoff に記録する(ヘッダー付きなら
        // onResponse→record が拾うが、ヘッダー無し 429 はここでキャッチする)。
        const now = Math.floor(Date.now() / 1000);
        const guard = new RateLimitGuard(c.env.KV);
        await guard.trip(now);
        return rateLimitedJson(c, now + DEFAULT_TRIP_SECONDS);
      }
      throw err;
    }
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
    try {
      await client.reblog(target, { id, reblogKey: reblogKey, comment, tags });
      return c.json({ ok: true });
    } catch (err) {
      if (err instanceof TumblrRateLimitError) {
        // Tumblr の 1,000/hr 予算は全エンドポイント共有なので、
        // ヘッダー無し 429 も backoff に記録する(ヘッダー付きなら
        // onResponse→record が拾うが、ヘッダー無し 429 はここでキャッチする)。
        const now = Math.floor(Date.now() / 1000);
        const guard = new RateLimitGuard(c.env.KV);
        await guard.trip(now);
        return rateLimitedJson(c, now + DEFAULT_TRIP_SECONDS);
      }
      throw err;
    }
  });
}
