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
      const limit = 20;
      const maxPages = 50;
      const first = await get<{ total_blogs: number; blogs: FollowingBlog[] }>(
        `/user/following?limit=${limit}&offset=0`,
      );
      const pages: FollowingBlog[][] = [first.blogs];
      const remaining = first.total_blogs - first.blogs.length;
      if (first.blogs.length > 0 && remaining > 0) {
        const extra = Math.min(Math.ceil(remaining / limit), maxPages - 1);
        const rest = await Promise.all(
          Array.from({ length: extra }, (_, i) =>
            get<{ blogs: FollowingBlog[] }>(
              `/user/following?limit=${limit}&offset=${(i + 1) * limit}`,
            ),
          ),
        );
        for (const r of rest) pages.push(r.blogs);
      }
      return pages.flat();
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
