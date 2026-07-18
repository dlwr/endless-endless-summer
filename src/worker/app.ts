import { Hono } from "hono";
import { registerApiRoutes } from "./api";
import { registerAuthRoutes } from "./auth";
import type { AppEnv } from "./env";

export type AppDeps = { fetchFn: typeof fetch };

// Workers の fetch は this がグローバル以外だと Illegal invocation になるためラップする
const defaultDeps: AppDeps = { fetchFn: (input, init) => fetch(input, init) };

export function createApp(deps: AppDeps = defaultDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.get("/api/health", (c) => c.json({ ok: true }));
  registerAuthRoutes(app, deps);
  registerApiRoutes(app, deps);
  return app;
}
