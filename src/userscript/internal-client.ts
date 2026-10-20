import type { FeedClient, FollowingBlog, RawPost } from "../core/feed-sampling";

const BASE = "https://www.tumblr.com/api/v2";

// ブラウザ / テストの双方で満たせる最小の fetch 形。tsconfig の
// @cloudflare/workers-types による `typeof fetch`(CF 版)への依存を避ける。
export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export function createInternalClient(deps: {
  getAuth: () => string | null;
  fetchFn: FetchLike;
}): FeedClient {
  const get = async <T>(path: string): Promise<T> => {
    const auth = deps.getAuth();
    if (!auth) throw new Error("no captured auth token");
    const res = await deps.fetchFn(`${BASE}${path}`, {
      headers: { Authorization: auth },
    });
    if (!res.ok) throw new Error(`internal api ${res.status}`);
    const body = (await res.json()) as { response: T };
    return body.response;
  };

  return {
    following: async (): Promise<FollowingBlog[]> => {
      const limit = 100;
      const concurrency = 4;
      type Page = { total_blogs: number; blogs: FollowingBlog[] };
      const page = (offset: number) =>
        get<Page>(`/user/following?limit=${limit}&offset=${offset}`);
      const first = await page(0);
      const offsets: number[] = [];
      for (let off = limit; off < first.total_blogs; off += limit) {
        offsets.push(off);
      }
      const pages: FollowingBlog[][] = [first.blogs];
      const worker = async () => {
        for (
          let off = offsets.shift();
          off !== undefined;
          off = offsets.shift()
        ) {
          pages[off / limit] = (await page(off)).blogs;
        }
      };
      await Promise.all(Array.from({ length: concurrency }, worker));
      return pages.flat().map(({ name, updated }) => ({ name, updated }));
    },
    posts: async (
      blogName: string,
      before: number,
      limit: number,
    ): Promise<RawPost[]> => {
      const res = await get<{ posts: RawPost[] }>(
        `/blog/${encodeURIComponent(blogName)}/posts?npf=true&limit=${limit}&before=${before}`,
      );
      return res.posts;
    },
  };
}
