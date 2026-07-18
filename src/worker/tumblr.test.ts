import { describe, expect, it } from "vitest";
import { fakeFetch } from "./test-helpers";
import {
  exchangeCode,
  refreshTokens,
  type Tokens,
  TumblrClient,
  TumblrRateLimitError,
} from "./tumblr";

const creds = { clientId: "cid", clientSecret: "sec" };

const liveTokens: Tokens = {
  accessToken: "at",
  refreshToken: "rt",
  expiresAt: 9_999_999_999,
};

function tokenResponse() {
  return {
    access_token: "new-at",
    refresh_token: "new-rt",
    expires_in: 3600,
    token_type: "bearer",
  };
}

describe("exchangeCode", () => {
  it("認可コードをトークンに交換する", async () => {
    const fetchFn = fakeFetch({ "/v2/oauth2/token": tokenResponse });
    const tokens = await exchangeCode(
      creds,
      "the-code",
      "https://x/auth/callback",
      fetchFn,
    );
    expect(tokens.accessToken).toBe("new-at");
  });

  it("grant_type などを form-encoded で送る", async () => {
    const fetchFn = fakeFetch({ "/v2/oauth2/token": tokenResponse });
    await exchangeCode(creds, "the-code", "https://x/auth/callback", fetchFn);
    const body = new URLSearchParams(await fetchFn.calls[0].text());
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("the-code");
    expect(body.get("client_secret")).toBe("sec");
  });
});

describe("refreshTokens", () => {
  it("refresh_token グラントで新しいトークンを得る", async () => {
    const fetchFn = fakeFetch({ "/v2/oauth2/token": tokenResponse });
    const tokens = await refreshTokens(creds, "old-rt", fetchFn);
    expect(tokens.refreshToken).toBe("new-rt");
  });
});

describe("TumblrClient", () => {
  it("Bearer トークンを付けて API を呼ぶ", async () => {
    const fetchFn = fakeFetch({
      "/v2/user/info": { response: { user: { name: "u", blogs: [] } } },
    });
    const client = new TumblrClient(liveTokens, creds, async () => {}, fetchFn);
    await client.userInfo();
    expect(fetchFn.calls[0].headers.get("Authorization")).toBe("Bearer at");
  });

  it("期限切れトークンはリフレッシュして onTokens に通知する", async () => {
    const expired: Tokens = { ...liveTokens, expiresAt: 100 };
    const saved: Tokens[] = [];
    const fetchFn = fakeFetch({
      "/v2/oauth2/token": tokenResponse,
      "/v2/user/info": { response: { user: { name: "u", blogs: [] } } },
    });
    const client = new TumblrClient(
      expired,
      creds,
      async (t) => {
        saved.push(t);
      },
      fetchFn,
      () => 1_000_000,
    );
    await client.userInfo();
    expect(saved[0]?.accessToken).toBe("new-at");
  });

  it("following は total_blogs に達するまでページングする", async () => {
    const page = (offset: number) => ({
      response: {
        total_blogs: 3,
        blogs: offset === 0 ? [{ name: "a" }, { name: "b" }] : [{ name: "c" }],
      },
    });
    const fetchFn = fakeFetch({
      "/v2/user/following": (req) =>
        page(Number(new URL(req.url).searchParams.get("offset"))),
    });
    const client = new TumblrClient(liveTokens, creds, async () => {}, fetchFn);
    const blogs = await client.following();
    expect(blogs.map((b) => b.name)).toEqual(["a", "b", "c"]);
  });

  it("posts は npf=true と before を付けて呼ぶ", async () => {
    const fetchFn = fakeFetch({
      "/v2/blog/example/posts": { response: { posts: [{ id_string: "1" }] } },
    });
    const client = new TumblrClient(liveTokens, creds, async () => {}, fetchFn);
    await client.posts("example", 1234567890, 2);
    const url = new URL(fetchFn.calls[0].url);
    expect(url.searchParams.get("npf")).toBe("true");
    expect(url.searchParams.get("before")).toBe("1234567890");
    expect(url.searchParams.get("limit")).toBe("2");
  });

  it("reblog は id と reblog_key を form で POST する", async () => {
    const fetchFn = fakeFetch({
      "/v2/blog/myblog/post/reblog": { response: {} },
    });
    const client = new TumblrClient(liveTokens, creds, async () => {}, fetchFn);
    await client.reblog("myblog", {
      id: "1",
      reblogKey: "rk",
      comment: "hi",
      tags: "a,b",
    });
    const body = new URLSearchParams(await fetchFn.calls[0].text());
    expect(body.get("id")).toBe("1");
    expect(body.get("reblog_key")).toBe("rk");
    expect(body.get("tags")).toBe("a,b");
  });

  it("like は /v2/user/like に POST する", async () => {
    const fetchFn = fakeFetch({ "/v2/user/like": { response: {} } });
    const client = new TumblrClient(liveTokens, creds, async () => {}, fetchFn);
    await client.like("1", "rk");
    expect(new URL(fetchFn.calls[0].url).pathname).toBe("/v2/user/like");
  });

  it("like は id と reblog_key を form で POST する", async () => {
    const fetchFn = fakeFetch({ "/v2/user/like": { response: {} } });
    const client = new TumblrClient(liveTokens, creds, async () => {}, fetchFn);
    await client.like("123", "abc");
    const body = new URLSearchParams(await fetchFn.calls[0].text());
    expect(body.get("id")).toBe("123");
    expect(body.get("reblog_key")).toBe("abc");
  });

  it("unlike は /v2/user/unlike に POST する", async () => {
    const fetchFn = fakeFetch({ "/v2/user/unlike": { response: {} } });
    const client = new TumblrClient(liveTokens, creds, async () => {}, fetchFn);
    await client.unlike("1", "rk");
    expect(new URL(fetchFn.calls[0].url).pathname).toBe("/v2/user/unlike");
  });

  it("API がエラーを返したら例外を投げる", async () => {
    const fetchFn = fakeFetch({
      "/v2/user/info": () => new Response("nope", { status: 401 }),
    });
    const client = new TumblrClient(liveTokens, creds, async () => {}, fetchFn);
    await expect(client.userInfo()).rejects.toThrow("401");
  });

  it("429 を受けたら TumblrRateLimitError を投げる", async () => {
    const fetchFn = fakeFetch({
      "/v2/user/info": () => new Response("rate limited", { status: 429 }),
    });
    const client = new TumblrClient(liveTokens, creds, async () => {}, fetchFn);
    await expect(client.userInfo()).rejects.toBeInstanceOf(
      TumblrRateLimitError,
    );
  });

  it("TumblrRateLimitError は status 429 を持つ", async () => {
    const fetchFn = fakeFetch({
      "/v2/user/info": () => new Response("rate limited", { status: 429 }),
    });
    const client = new TumblrClient(liveTokens, creds, async () => {}, fetchFn);
    const error = await client.userInfo().catch((err) => err);
    expect((error as TumblrRateLimitError).status).toBe(429);
  });

  it("成功レスポンスでも onResponse が呼ばれる", async () => {
    const fetchFn = fakeFetch({
      "/v2/user/info": { response: { user: { name: "u", blogs: [] } } },
    });
    const responses: Response[] = [];
    const client = new TumblrClient(
      liveTokens,
      creds,
      async () => {},
      fetchFn,
      undefined,
      async (res) => {
        responses.push(res);
      },
    );
    await client.userInfo();
    expect(responses).toHaveLength(1);
  });

  it("失敗レスポンスでも onResponse が呼ばれる", async () => {
    const fetchFn = fakeFetch({
      "/v2/user/info": () => new Response("nope", { status: 401 }),
    });
    const responses: Response[] = [];
    const client = new TumblrClient(
      liveTokens,
      creds,
      async () => {},
      fetchFn,
      undefined,
      async (res) => {
        responses.push(res);
      },
    );
    await expect(client.userInfo()).rejects.toThrow();
    expect(responses).toHaveLength(1);
  });

  // Workers ランタイムの fetch は this がグローバル以外だと Illegal invocation を投げる
  it("fetchFn 未指定時もグローバル fetch を this 非依存で呼ぶ", async () => {
    const original = globalThis.fetch;
    function strictFetch(this: unknown): Promise<Response> {
      if (this !== undefined && this !== globalThis) {
        return Promise.reject(new TypeError("Illegal invocation"));
      }
      return Promise.resolve(
        Response.json({ response: { user: { name: "u", blogs: [] } } }),
      );
    }
    globalThis.fetch = strictFetch as unknown as typeof fetch;
    try {
      const client = new TumblrClient(liveTokens, creds, async () => {});
      const user = await client.userInfo();
      expect(user.name).toBe("u");
    } finally {
      globalThis.fetch = original;
    }
  });
});
