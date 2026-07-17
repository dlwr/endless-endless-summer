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
        blogs: [
          { name: "myblog", title: "My Blog", primary: true, uuid: "uuid-1" },
        ],
      },
    },
  },
};

describe("GET /auth/login", () => {
  it("Tumblr の認可 URL にリダイレクトする", async () => {
    const app = createApp({ fetchFn: fakeFetch({}) });
    const res = await app.request(
      "https://ees.example/auth/login",
      {},
      env(new FakeKV()),
    );
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("Location") ?? "");
    expect(location.origin + location.pathname).toBe(
      "https://www.tumblr.com/oauth2/authorize",
    );
    expect(location.searchParams.get("scope")).toBe(
      "basic write offline_access",
    );
    expect(location.searchParams.get("redirect_uri")).toBe(
      "https://ees.example/auth/callback",
    );
  });

  it("state クッキーを設定する", async () => {
    const app = createApp({ fetchFn: fakeFetch({}) });
    const res = await app.request(
      "https://ees.example/auth/login",
      {},
      env(new FakeKV()),
    );
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
      tokens: {
        accessToken: "at",
        refreshToken: "rt",
        expiresAt: 9_999_999_999,
      },
      userName: "u",
      blogs: [
        { name: "myblog", title: "My Blog", primary: true, uuid: "uuid-1" },
      ],
    };
    const sid = await new SessionStore(kv as unknown as KVNamespace).create(
      session,
    );
    const app = createApp({ fetchFn: fakeFetch({}) });
    const res = await app.request(
      "/api/me",
      { headers: { Cookie: `sid=${sid}` } },
      env(kv),
    );
    expect(await res.json()).toEqual({ userName: "u", blogs: session.blogs });
  });
});

describe("POST /auth/logout", () => {
  it("有効な sid でリクエストすると KV からセッションが消える", async () => {
    const kv = new FakeKV();
    const session: Session = {
      tokens: {
        accessToken: "at",
        refreshToken: "rt",
        expiresAt: 9_999_999_999,
      },
      userName: "u",
      blogs: [
        { name: "myblog", title: "My Blog", primary: true, uuid: "uuid-1" },
      ],
    };
    const sid = await new SessionStore(kv as unknown as KVNamespace).create(
      session,
    );
    const app = createApp({ fetchFn: fakeFetch({}) });
    const res = await app.request(
      "https://ees.example/auth/logout",
      { method: "POST", headers: { Cookie: `sid=${sid}` } },
      env(kv),
    );
    expect(res.status).toBe(302);
    expect(kv.store.has(`session:${sid}`)).toBe(false);
  });

  it("sid クッキーが削除される", async () => {
    const kv = new FakeKV();
    const session: Session = {
      tokens: {
        accessToken: "at",
        refreshToken: "rt",
        expiresAt: 9_999_999_999,
      },
      userName: "u",
      blogs: [
        { name: "myblog", title: "My Blog", primary: true, uuid: "uuid-1" },
      ],
    };
    const sid = await new SessionStore(kv as unknown as KVNamespace).create(
      session,
    );
    const app = createApp({ fetchFn: fakeFetch({}) });
    const res = await app.request(
      "https://ees.example/auth/logout",
      { method: "POST", headers: { Cookie: `sid=${sid}` } },
      env(kv),
    );
    const setCookieHeaders = res.headers.getSetCookie();
    const sidCookie = setCookieHeaders.find((h) => h.startsWith("sid="));
    expect(sidCookie).toBeDefined();
    expect(sidCookie).toContain("Max-Age=0");
  });

  it("/ にリダイレクトする", async () => {
    const kv = new FakeKV();
    const session: Session = {
      tokens: {
        accessToken: "at",
        refreshToken: "rt",
        expiresAt: 9_999_999_999,
      },
      userName: "u",
      blogs: [
        { name: "myblog", title: "My Blog", primary: true, uuid: "uuid-1" },
      ],
    };
    const sid = await new SessionStore(kv as unknown as KVNamespace).create(
      session,
    );
    const app = createApp({ fetchFn: fakeFetch({}) });
    const res = await app.request(
      "https://ees.example/auth/logout",
      { method: "POST", headers: { Cookie: `sid=${sid}` } },
      env(kv),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/");
  });
});

describe("Cookie security attributes", () => {
  it("login の state クッキーに HttpOnly/Secure/SameSite=Lax/Path=/ と Max-Age=600 が付く", async () => {
    const app = createApp({ fetchFn: fakeFetch({}) });
    const res = await app.request(
      "https://ees.example/auth/login",
      {},
      env(new FakeKV()),
    );
    const setCookieHeaders = res.headers.getSetCookie();
    const stateCookie = setCookieHeaders.find((h) =>
      h.startsWith("oauth_state="),
    );
    expect(stateCookie).toBeDefined();
    expect(stateCookie).toContain("HttpOnly");
    expect(stateCookie).toContain("Secure");
    expect(stateCookie).toContain("SameSite=Lax");
    expect(stateCookie).toContain("Path=/");
    expect(stateCookie).toContain("Max-Age=600");
  });

  it("callback の sid クッキーに HttpOnly/Secure/SameSite=Lax/Path=/ と Max-Age=2592000 が付く", async () => {
    const kv = new FakeKV();
    const app = createApp({ fetchFn: fakeFetch(tumblrMocks) });
    const res = await app.request(
      "https://ees.example/auth/callback?code=c&state=s",
      { headers: { Cookie: "oauth_state=s" } },
      env(kv),
    );
    const setCookieHeaders = res.headers.getSetCookie();
    const sidCookie = setCookieHeaders.find((h) => h.startsWith("sid="));
    expect(sidCookie).toBeDefined();
    expect(sidCookie).toContain("HttpOnly");
    expect(sidCookie).toContain("Secure");
    expect(sidCookie).toContain("SameSite=Lax");
    expect(sidCookie).toContain("Path=/");
    expect(sidCookie).toContain("Max-Age=2592000");
  });
});
