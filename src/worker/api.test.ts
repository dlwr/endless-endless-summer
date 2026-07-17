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
  const sid = await new SessionStore(kv as unknown as KVNamespace).create(
    session,
  );
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
    const res = await authedRequest(
      "/api/like",
      { id: "1", reblogKey: "rk", like: true },
      tumblr,
    );
    expect(res.status).toBe(200);
    expect(new URL(tumblr.calls[0].url).pathname).toBe("/v2/user/like");
  });

  it("like=false なら /v2/user/unlike を呼ぶ", async () => {
    const tumblr = fakeFetch({ "/v2/user/unlike": { response: {} } });
    await authedRequest(
      "/api/like",
      { id: "1", reblogKey: "rk", like: false },
      tumblr,
    );
    expect(new URL(tumblr.calls[0].url).pathname).toBe("/v2/user/unlike");
  });
});

describe("POST /api/reblog", () => {
  it("blogName 省略時はプライマリブログにリブログする", async () => {
    const tumblr = fakeFetch({
      "/v2/blog/mainblog/post/reblog": { response: {} },
    });
    const res = await authedRequest(
      "/api/reblog",
      { id: "1", reblogKey: "rk" },
      tumblr,
    );
    expect(res.status).toBe(200);
    expect(new URL(tumblr.calls[0].url).pathname).toBe(
      "/v2/blog/mainblog/post/reblog",
    );
  });

  it("blogName 指定時はそのブログにリブログする", async () => {
    const tumblr = fakeFetch({
      "/v2/blog/secondary/post/reblog": { response: {} },
    });
    await authedRequest(
      "/api/reblog",
      {
        id: "1",
        reblogKey: "rk",
        blogName: "secondary",
        comment: "c",
        tags: "a,b",
      },
      tumblr,
    );
    expect(new URL(tumblr.calls[0].url).pathname).toBe(
      "/v2/blog/secondary/post/reblog",
    );
  });

  it("プライマリブログが無く blogName も省略された場合は 400", async () => {
    const noPrimarySession: Session = {
      ...session,
      blogs: [
        { name: "secondary", title: "2nd", primary: false, uuid: "uuid-2" },
      ],
    };
    const kv = new FakeKV();
    const sid = await new SessionStore(kv as unknown as KVNamespace).create(
      noPrimarySession,
    );
    const app = createApp({ fetchFn: fakeFetch({}) });
    const res = await app.request(
      "/api/reblog",
      {
        method: "POST",
        headers: { Cookie: `sid=${sid}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id: "1", reblogKey: "rk" }),
      },
      { KV: kv, TUMBLR_CLIENT_ID: "cid", TUMBLR_CLIENT_SECRET: "sec" },
    );
    expect(res.status).toBe(400);
  });
});
