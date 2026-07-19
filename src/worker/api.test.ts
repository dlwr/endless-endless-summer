import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { type Session, SessionStore } from "./session";
import { FakeKV, fakeFetch } from "./test-helpers";

async function setupSession(
  tumblrFetch: ReturnType<typeof fakeFetch>,
  sessionOverride: Session = session,
) {
  const kv = new FakeKV();
  const sid = await new SessionStore(kv as unknown as KVNamespace).create(
    sessionOverride,
  );
  const app = createApp({ fetchFn: tumblrFetch });
  const env = { KV: kv, TUMBLR_CLIENT_ID: "cid", TUMBLR_CLIENT_SECRET: "sec" };
  const getFeed = () =>
    app.request("/api/feed", { headers: { Cookie: `sid=${sid}` } }, env);
  const postLike = (body: unknown) =>
    app.request(
      "/api/like",
      {
        method: "POST",
        headers: { Cookie: `sid=${sid}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      env,
    );
  const postReblog = (body: unknown) =>
    app.request(
      "/api/reblog",
      {
        method: "POST",
        headers: { Cookie: `sid=${sid}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      env,
    );
  return { kv, sid, app, env, getFeed, postLike, postReblog };
}

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

  it("Tumblr が 429 を返したら 429 と retryAt を返す", async () => {
    const tumblr = fakeFetch({
      "/v2/blog/mainblog/post/reblog": () =>
        new Response("nope", { status: 429 }),
    });
    const res = await authedRequest(
      "/api/reblog",
      { id: "1", reblogKey: "rk" },
      tumblr,
    );
    const body = (await res.json()) as { error: string; retryAt: number };

    expect(res.status).toBe(429);
    expect(body.error).toBe("rate_limited");
  });
});

describe("POST /api/reblog レートリミット", () => {
  it("/api/reblog で Tumblr が 429 を返すと backoff が設定される", async () => {
    const tumblr = fakeFetch({
      "/v2/blog/mainblog/post/reblog": () =>
        new Response("nope", { status: 429 }),
    });
    const { kv, postReblog } = await setupSession(tumblr);
    await postReblog({ id: "1", reblogKey: "rk" });

    const backoff = await kv.get("ratelimit:backoff", "json");
    expect(backoff).not.toBeNull();
    expect(typeof backoff).toBe("number");
  });
});

describe("GET /api/feed レートリミット", () => {
  it("backoff 中は Tumblr を呼ばずに 429 と retryAt を返す", async () => {
    const tumblr = fakeFetch({});
    const { kv, getFeed } = await setupSession(tumblr);
    const retryAt = Math.floor(Date.now() / 1000) + 1000;
    await kv.put("ratelimit:backoff", JSON.stringify(retryAt));

    const res = await getFeed();

    expect(res.status).toBe(429);
    expect(tumblr.calls.length).toBe(0);
  });

  it("backoff 中のレスポンスは error と backoff の解除時刻を retryAt として含む", async () => {
    const tumblr = fakeFetch({});
    const { kv, getFeed } = await setupSession(tumblr);
    const retryAt = Math.floor(Date.now() / 1000) + 1000;
    await kv.put("ratelimit:backoff", JSON.stringify(retryAt));

    const res = await getFeed();
    const body = (await res.json()) as { error: string; retryAt: number };

    expect(body).toEqual({ error: "rate_limited", retryAt });
  });

  it("Tumblr が 429 を返したら 429 と retryAt を返す", async () => {
    const tumblr = fakeFetch({
      "/v2/user/following": () => new Response("nope", { status: 429 }),
    });
    const { getFeed } = await setupSession(tumblr);

    const res = await getFeed();
    const body = (await res.json()) as { error: string; retryAt: number };

    expect(res.status).toBe(429);
    expect(body.error).toBe("rate_limited");
    expect(typeof body.retryAt).toBe("number");
  });

  it("Tumblr の 429 を受けた後は次の /api/feed リクエストも backoff で弾かれる", async () => {
    const tumblr = fakeFetch({
      "/v2/user/following": () => new Response("nope", { status: 429 }),
    });
    const { getFeed } = await setupSession(tumblr);
    await getFeed();

    const secondCallCount = tumblr.calls.length;
    const res = await getFeed();

    expect(res.status).toBe(429);
    // backoff で弾かれていれば following への Tumblr 呼び出しは増えない
    expect(tumblr.calls.length).toBe(secondCallCount);
  });

  it("200 応答でも残量が枯渇気味の x-ratelimit ヘッダーが付いていれば次の /api/feed は backoff で弾かれる", async () => {
    // record() 経由の「事前 backoff」(429 を実際に受ける前に予算切れを学習する)を検証する。
    const tumblr = fakeFetch({
      "/v2/user/following": () =>
        Response.json(
          { response: { total_blogs: 0, blogs: [] } },
          {
            headers: {
              "x-ratelimit-perhour-remaining": "50",
              "x-ratelimit-perday-remaining": "2000",
              "x-ratelimit-perhour-reset": "1800",
              "x-ratelimit-perday-reset": "43200",
            },
          },
        ),
    });
    const { getFeed } = await setupSession(tumblr);

    const first = await getFeed();
    expect(first.status).toBe(200);

    const second = await getFeed();
    expect(second.status).toBe(429);
  });
});

describe("POST /api/like レートリミット", () => {
  it("Tumblr が 429 を返したら 429 と retryAt を返す", async () => {
    const tumblr = fakeFetch({
      "/v2/user/like": () => new Response("nope", { status: 429 }),
    });
    const { postLike } = await setupSession(tumblr);

    const res = await postLike({ id: "1", reblogKey: "rk", like: true });
    const body = (await res.json()) as { error: string; retryAt: number };

    expect(res.status).toBe(429);
    expect(body.error).toBe("rate_limited");
  });

  it("/api/feed が backoff 中でも guard.check() を経由せず Tumblr へリクエストする", async () => {
    const tumblr = fakeFetch({ "/v2/user/like": { response: {} } });
    const { kv, postLike } = await setupSession(tumblr);
    await kv.put(
      "ratelimit:backoff",
      JSON.stringify(Math.floor(Date.now() / 1000) + 1000),
    );

    const res = await postLike({ id: "1", reblogKey: "rk", like: true });

    expect(res.status).toBe(200);
    expect(tumblr.calls.length).toBe(1);
  });

  it("/api/like で Tumblr が 429 を返すと backoff が設定される", async () => {
    const tumblr = fakeFetch({
      "/v2/user/like": () => new Response("nope", { status: 429 }),
    });
    const { kv, postLike } = await setupSession(tumblr);
    await postLike({ id: "1", reblogKey: "rk", like: true });

    const backoff = await kv.get("ratelimit:backoff", "json");
    expect(backoff).not.toBeNull();
    expect(typeof backoff).toBe("number");
  });
});
