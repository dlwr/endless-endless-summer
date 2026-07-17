import type { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppDeps } from "./app";
import type { AppEnv } from "./env";
import { SessionStore } from "./session";
import { exchangeCode, TumblrClient } from "./tumblr";

const AUTHORIZE_URL = "https://www.tumblr.com/oauth2/authorize";

function redirectUri(requestUrl: string): string {
  return new URL("/auth/callback", requestUrl).toString();
}

const cookieOpts = {
  httpOnly: true,
  secure: true,
  sameSite: "Lax" as const,
  path: "/",
};

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
    const tokens = await exchangeCode(
      creds,
      code,
      redirectUri(c.req.url),
      deps.fetchFn,
    );
    let currentTokens = tokens;
    const client = new TumblrClient(
      tokens,
      creds,
      async (t) => {
        currentTokens = t;
      },
      deps.fetchFn,
    );
    const user = await client.userInfo();

    const store = new SessionStore(c.env.KV);
    const sid = await store.create({
      tokens: currentTokens,
      userName: user.name,
      blogs: user.blogs,
    });
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
