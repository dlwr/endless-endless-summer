import type { Context, Hono } from "hono";
import type { AppDeps } from "./app";
import type { AppEnv } from "./env";
import { buildFeed } from "./feed";
import { requireSession, SessionStore } from "./session";
import { TumblrClient } from "./tumblr";

export function clientForSession(
  c: Context<AppEnv>,
  deps: AppDeps,
): TumblrClient {
  const session = c.get("session");
  const sid = c.get("sid");
  const store = new SessionStore(c.env.KV);
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
  );
}

export function registerApiRoutes(app: Hono<AppEnv>, deps: AppDeps): void {
  app.get("/api/me", requireSession(), (c) => {
    const session = c.get("session");
    return c.json({ userName: session.userName, blogs: session.blogs });
  });

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
}
