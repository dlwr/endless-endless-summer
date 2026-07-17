import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "./env";
import { requireSession, type Session, SessionStore } from "./session";
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
