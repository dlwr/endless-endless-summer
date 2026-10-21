import { describe, expect, it, vi } from "vitest";
import { RateLimitedError } from "../core/oldest";
import {
  type ApiFetch,
  createFeedClient,
  createTumblrApi,
  findApiFetch,
} from "./tumblr-api";

const apiError = (status: number) =>
  Object.assign(new Error(`api ${status}`), { status });

const followingPage = (names: string[]) => ({
  response: {
    totalBlogs: 3,
    blogs: names.map((name) => ({
      name,
      url: `https://${name}.tumblr.com/`,
      title: name.toUpperCase(),
      updated: 1_700_000_000,
      posts: 12,
      durationFollowingBlog: 1000,
    })),
  },
});

describe("createTumblrApi.following", () => {
  it("全ページを取得して CurationBlog に変換する", async () => {
    const apiFetch = vi.fn<ApiFetch>(async (_path, init) => {
      const offset = Number(init?.queryParams?.offset);
      if (offset === 0) return followingPage(["a", "b"]);
      if (offset === 2) return followingPage(["c"]);
      return followingPage([]);
    });
    const api = createTumblrApi({ apiFetch, now: () => 5000, pageSize: 2 });
    expect(await api.following()).toEqual(
      ["a", "b", "c"].map((name) => ({
        name,
        url: `https://${name}.tumblr.com/`,
        title: name.toUpperCase(),
        updated: 1_700_000_000,
        posts: 12,
        followedAt: 4000,
        oldest: undefined,
      })),
    );
  });

  it("url と posts を含む fields を指定する", async () => {
    const apiFetch = vi.fn<ApiFetch>(async () => followingPage([]));
    await createTumblrApi({ apiFetch, now: () => 0 }).following();
    const fields = String(
      apiFetch.mock.calls[0][1]?.queryParams?.["fields[blogs]"],
    );
    expect(fields.split(",")).toEqual(
      expect.arrayContaining([
        "name",
        "url",
        "posts",
        "?duration_following_blog",
      ]),
    );
  });
});

describe("createTumblrApi.oldest", () => {
  it("sort=asc の先頭ポストの timestamp を返す", async () => {
    const apiFetch = vi.fn<ApiFetch>(async () => ({
      response: { posts: [{ timestamp: 1_200_000_000 }] },
    }));
    const api = createTumblrApi({ apiFetch, now: () => 0 });
    expect(await api.oldest("a")).toEqual({ kind: "found", ts: 1_200_000_000 });
  });

  it("sort=asc と limit=1 で posts を呼ぶ", async () => {
    const apiFetch = vi.fn<ApiFetch>(async () => ({ response: { posts: [] } }));
    await createTumblrApi({ apiFetch, now: () => 0 }).oldest("a b");
    expect(apiFetch.mock.calls[0]).toEqual([
      "/v2/blog/a%20b/posts",
      { queryParams: { sort: "asc", limit: 1 } },
    ]);
  });

  it("ポストが無ければ empty を返す", async () => {
    const apiFetch = vi.fn<ApiFetch>(async () => ({ response: { posts: [] } }));
    const api = createTumblrApi({ apiFetch, now: () => 0 });
    expect(await api.oldest("a")).toEqual({ kind: "empty" });
  });

  it("404 なら empty を返す", async () => {
    const apiFetch = vi.fn<ApiFetch>(async () => {
      throw apiError(404);
    });
    const api = createTumblrApi({ apiFetch, now: () => 0 });
    expect(await api.oldest("a")).toEqual({ kind: "empty" });
  });

  it("429 なら RateLimitedError を投げる", async () => {
    const apiFetch = vi.fn<ApiFetch>(async () => {
      throw apiError(429);
    });
    const api = createTumblrApi({ apiFetch, now: () => 0 });
    await expect(api.oldest("a")).rejects.toBeInstanceOf(RateLimitedError);
  });

  it("その他のエラーはそのまま投げる", async () => {
    const apiFetch = vi.fn<ApiFetch>(async () => {
      throw apiError(500);
    });
    const api = createTumblrApi({ apiFetch, now: () => 0 });
    await expect(api.oldest("a")).rejects.toThrow("api 500");
  });
});

describe("createTumblrApi.unfollow / follow", () => {
  it("unfollow は url を POST する", async () => {
    const apiFetch = vi.fn<ApiFetch>(async () => ({ response: {} }));
    await createTumblrApi({ apiFetch, now: () => 0 }).unfollow("https://a/");
    expect(apiFetch).toHaveBeenCalledWith("/v2/user/unfollow", {
      method: "POST",
      body: { url: "https://a/" },
    });
  });

  it("follow は url を POST する", async () => {
    const apiFetch = vi.fn<ApiFetch>(async () => ({ response: {} }));
    await createTumblrApi({ apiFetch, now: () => 0 }).follow("https://a/");
    expect(apiFetch).toHaveBeenCalledWith("/v2/user/follow", {
      method: "POST",
      body: { url: "https://a/" },
    });
  });

  it("unfollow が 429 なら RateLimitedError を投げる", async () => {
    const apiFetch = vi.fn<ApiFetch>(async () => {
      throw apiError(429);
    });
    const api = createTumblrApi({ apiFetch, now: () => 0 });
    await expect(api.unfollow("u")).rejects.toBeInstanceOf(RateLimitedError);
  });
});

describe("createTumblrApi.posts", () => {
  it("npf と before/limit 付きで blog posts を呼ぶ", async () => {
    const apiFetch = vi.fn<ApiFetch>(async () => ({ response: { posts: [] } }));
    await createTumblrApi({ apiFetch, now: () => 0 }).posts("a b", 1234, 3);
    expect(apiFetch).toHaveBeenCalledWith("/v2/blog/a%20b/posts", {
      queryParams: { npf: "true", before: 1234, limit: 3 },
    });
  });

  it("response.posts をそのまま返す", async () => {
    const posts = [{ idString: "1" }, { idString: "2" }];
    const apiFetch = vi.fn<ApiFetch>(async () => ({ response: { posts } }));
    const api = createTumblrApi({ apiFetch, now: () => 0 });
    expect(await api.posts("a", 1, 2)).toEqual(posts);
  });
});

describe("createFeedClient", () => {
  it("following は name と updated だけに絞る", async () => {
    const apiFetch = vi.fn<ApiFetch>(async () => followingPage(["a"]));
    const client = createFeedClient(
      createTumblrApi({ apiFetch, now: () => 0 }),
    );
    expect(await client.following()).toEqual([
      { name: "a", updated: 1_700_000_000 },
    ]);
  });
});

describe("findApiFetch", () => {
  it("window.tumblr.apiFetch を返す", () => {
    const apiFetch: ApiFetch = async () => ({});
    expect(findApiFetch({ tumblr: { apiFetch } })).toBe(apiFetch);
  });

  it("window.tumblr が未定義なら undefined", () => {
    expect(findApiFetch({})).toBeUndefined();
  });
});
