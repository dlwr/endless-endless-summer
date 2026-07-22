import { describe, expect, it, vi } from "vitest";
import following from "./fixtures/following.json";
import posts from "./fixtures/posts.json";
import { createInternalClient, type FetchLike } from "./internal-client";

const jsonRes = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
});

const mockFetch = (body: unknown) =>
  vi.fn<FetchLike>(async () => jsonRes(body));

describe("createInternalClient", () => {
  it("following を internal API から取得し blogs を返す", async () => {
    const client = createInternalClient({
      getAuth: () => "tok",
      fetchFn: mockFetch(following),
    });
    expect(await client.following()).toEqual([
      { name: "alpha" },
      { name: "beta" },
    ]);
  });

  it("posts を before/limit 付きで取得する", async () => {
    const fetchFn = mockFetch(posts);
    const client = createInternalClient({ getAuth: () => "tok", fetchFn });
    const got = await client.posts("alpha", 1_420_070_400, 3);
    expect(got[0].id_string).toBe("1");
    const url = fetchFn.mock.calls[0][0];
    expect(url).toContain("/api/v2/blog/alpha/posts");
    expect(url).toContain("before=1420070400");
    expect(url).toContain("limit=3");
  });

  it("Authorization ヘッダーに getAuth() の値を付ける", async () => {
    const fetchFn = mockFetch(posts);
    const client = createInternalClient({ getAuth: () => "abc", fetchFn });
    await client.posts("alpha", 1, 1);
    expect(fetchFn.mock.calls[0][1]?.headers?.Authorization).toBe("abc");
  });

  it("getAuth() が null なら例外", async () => {
    const client = createInternalClient({
      getAuth: () => null,
      fetchFn: mockFetch({}),
    });
    await expect(client.posts("a", 1, 1)).rejects.toThrow();
  });
});
