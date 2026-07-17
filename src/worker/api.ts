import type { Context, Hono } from "hono";
import type { AppDeps } from "./app";
import type { AppEnv } from "./env";
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

export function registerApiRoutes(app: Hono<AppEnv>, _deps: AppDeps): void {
  app.get("/api/me", requireSession(), (c) => {
    const session = c.get("session");
    return c.json({ userName: session.userName, blogs: session.blogs });
  });
}
