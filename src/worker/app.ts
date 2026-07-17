import { Hono } from "hono";
import type { AppEnv } from "./env";

export type AppDeps = { fetchFn: typeof fetch };

const defaultDeps: AppDeps = { fetchFn: fetch };

export function createApp(deps: AppDeps = defaultDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.get("/api/health", (c) => c.json({ ok: true }));
  return app;
}
