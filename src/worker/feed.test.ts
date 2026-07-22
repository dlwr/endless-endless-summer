import { describe, expect, it } from "vitest";
import { TUMBLR_EPOCH } from "../core/sampling";
import { buildFeed, deriveKind, normalizePost } from "./feed";
import { FakeKV } from "./test-helpers";
import { type RawPost, TumblrRateLimitError } from "./tumblr";

const rawPost = (over: Partial<Record<string, unknown>> = {}): RawPost => ({
  id_string: "123",
  blog_name: "example",
  post_url: "https://example.tumblr.com/post/123",
  timestamp: 1_500_000_000,
  tags: ["summer"],
  reblog_key: "rk",
  liked: false,
  content: [{ type: "text", text: "hello" }],
  trail: [],
  ...over,
});

describe("deriveKind", () => {
  it("video ブロックがあれば video", () => {
    expect(deriveKind([{ type: "text", text: "x" }, { type: "video" }])).toBe(
      "video",
    );
  });

  it("image ブロックがあれば image", () => {
    expect(deriveKind([{ type: "image", media: [] }])).toBe("image");
  });

  it("ブロックが無ければ text", () => {
    expect(deriveKind([])).toBe("text");
  });
});

describe("normalizePost", () => {
  it("生ポストを FeedPost に変換する", () => {
    const post = normalizePost(rawPost());
    expect(post).toEqual({
      id: "123",
      blogName: "example",
      postUrl: "https://example.tumblr.com/post/123",
      timestamp: 1_500_000_000,
      tags: ["summer"],
      reblogKey: "rk",
      liked: false,
      kind: "text",
      content: [{ type: "text", text: "hello" }],
      trail: [],
    });
  });

  it("trail はブログ名とコンテンツに絞る", () => {
    const post = normalizePost(
      rawPost({
        trail: [
          { blog: { name: "origin" }, content: [{ type: "text", text: "og" }] },
        ],
      }),
    );
    expect(post.trail).toEqual([
      { blogName: "origin", content: [{ type: "text", text: "og" }] },
    ]);
  });

  it("kind は trail のブロックも見て判定する", () => {
    const post = normalizePost(
      rawPost({
        content: [],
        trail: [
          { blog: { name: "o" }, content: [{ type: "image", media: [] }] },
        ],
      }),
    );
    expect(post.kind).toBe("image");
  });
});

describe("buildFeed", () => {
  function fakeClient(postsByBlog: Record<string, RawPost[]>) {
    const calls: { blog: string; before: number }[] = [];
    return {
      calls,
      following: async () => Object.keys(postsByBlog).map((name) => ({ name })),
      posts: async (blog: string, before: number, _limit: number) => {
        calls.push({ blog, before });
        return postsByBlog[blog] ?? [];
      },
    };
  }

  const now = 1_750_000_000;

  it("フォロー中ブログのポストを正規化して返す", async () => {
    const client = fakeClient({
      a: [rawPost()],
      b: [rawPost({ id_string: "9" })],
    });
    const kv = new FakeKV();
    const posts = await buildFeed(
      client,
      kv as unknown as KVNamespace,
      "u",
      () => 0.5,
      now,
    );
    expect(posts.length).toBeGreaterThan(0);
    expect(posts[0]).toHaveProperty("reblogKey");
  });

  it("following 一覧を KV にキャッシュする", async () => {
    const client = fakeClient({ a: [rawPost()] });
    const kv = new FakeKV();
    await buildFeed(client, kv as unknown as KVNamespace, "u", () => 0.5, now);
    expect(await kv.get("following:u", "json")).toEqual([{ name: "a" }]);
  });

  it("空バッチのブログには oldest: の下限を記録する", async () => {
    const client = fakeClient({ empty: [] });
    const kv = new FakeKV();
    await buildFeed(client, kv as unknown as KVNamespace, "u", () => 0.5, now);
    const bound = (await kv.get("oldest:empty", "json")) as number;
    expect(bound).toBeGreaterThan(TUMBLR_EPOCH);
  });

  it("記録済みの oldest: 下限より前はサンプルしない", async () => {
    const client = fakeClient({ a: [rawPost()] });
    const kv = new FakeKV();
    const bound = 1_600_000_000;
    await kv.put("oldest:a", JSON.stringify(bound));
    await buildFeed(client, kv as unknown as KVNamespace, "u", () => 0, now);
    for (const call of client.calls) {
      expect(call.before).toBeGreaterThanOrEqual(bound);
    }
  });

  it("フォローが 0 件なら空配列を返す", async () => {
    const client = fakeClient({});
    const posts = await buildFeed(
      client,
      new FakeKV() as unknown as KVNamespace,
      "u",
      () => 0.5,
      now,
    );
    expect(posts).toEqual([]);
  });

  function cyclicRng(sequence: number[]) {
    let i = 0;
    return () => sequence[i++ % sequence.length];
  }

  it("一部のブログで posts が例外を投げても他のブログのポストは返す", async () => {
    const following = [{ name: "a" }, { name: "b" }, { name: "c" }];
    const postsByBlog: Record<string, RawPost[]> = {
      a: [rawPost({ id_string: "a1" })],
      b: [rawPost({ id_string: "b1" })],
      c: [rawPost({ id_string: "c1" })],
    };
    const client = {
      following: async () => following,
      posts: async (blog: string, _before: number, _limit: number) => {
        if (blog === "b") throw new Error("blog is private (404)");
        return postsByBlog[blog] ?? [];
      },
    };
    const kv = new FakeKV();
    // following.length === 3 なので 0, 1/3, 2/3 を繰り返せば a,b,c が均等に選ばれる
    const rng = cyclicRng([0, 1 / 3, 2 / 3]);
    const posts = await buildFeed(
      client,
      kv as unknown as KVNamespace,
      "u",
      rng,
      now,
    );
    const ids = posts.map((p) => p.id);
    expect(ids).not.toContain("b1");
    expect(ids).toContain("a1");
    expect(ids).toContain("c1");
  });

  it("posts が TumblrRateLimitError を投げたら他のブログの結果を握りつぶさず buildFeed も reject する", async () => {
    const following = [{ name: "a" }, { name: "limited" }];
    const client = {
      following: async () => following,
      posts: async (blog: string, _before: number, _limit: number) => {
        if (blog === "limited") throw new TumblrRateLimitError();
        return [rawPost({ id_string: "a1" })];
      },
    };
    const kv = new FakeKV();
    const rng = cyclicRng([0, 0.5]);
    await expect(
      buildFeed(client, kv as unknown as KVNamespace, "u", rng, now),
    ).rejects.toBeInstanceOf(TumblrRateLimitError);
  });

  it("すべてのブログで posts が例外を投げたら buildFeed は reject する", async () => {
    const following = [{ name: "x" }];
    const client = {
      following: async () => following,
      posts: async () => {
        throw new Error("rate limited (429)");
      },
    };
    const kv = new FakeKV();
    await expect(
      buildFeed(client, kv as unknown as KVNamespace, "u", () => 0.5, now),
    ).rejects.toThrow();
  });
});
