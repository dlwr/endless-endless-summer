import type { CurationBlog, Oldest } from "../core/curation";
import { RateLimitedError } from "../core/oldest";

// window.tumblr.apiFetch: Tumblr が拡張向けに公開している、ログイン中ユーザーの
// 認証で /v2 を叩く関数。レスポンスのキーは camelCase で返る。
export type ApiFetch = (
  path: string,
  init?: {
    method?: string;
    queryParams?: Record<string, string | number>;
    body?: Record<string, unknown>;
  },
) => Promise<unknown>;

type FollowingResponse = {
  response: {
    totalBlogs: number;
    blogs: {
      name: string;
      url: string;
      title: string;
      updated: number;
      posts: number;
      durationFollowingBlog: number;
    }[];
  };
};

const FOLLOWING_FIELDS =
  "name,url,title,updated,posts,?duration_following_blog";

const statusOf = (err: unknown): number | undefined =>
  (err as { status?: number } | null)?.status;

async function call<T>(
  apiFetch: ApiFetch,
  ...args: Parameters<ApiFetch>
): Promise<T> {
  try {
    return (await apiFetch(...args)) as T;
  } catch (err) {
    if (statusOf(err) === 429) throw new RateLimitedError();
    throw err;
  }
}

export function createTumblrApi(deps: {
  apiFetch: ApiFetch;
  now: () => number;
  pageSize?: number;
  concurrency?: number;
}) {
  const pageSize = deps.pageSize ?? 100;
  const concurrency = deps.concurrency ?? 4;

  const page = (offset: number) =>
    call<FollowingResponse>(deps.apiFetch, "/v2/user/following", {
      queryParams: {
        limit: pageSize,
        offset,
        "fields[blogs]": FOLLOWING_FIELDS,
      },
    });

  return {
    following: async (): Promise<CurationBlog[]> => {
      const first = await page(0);
      const offsets: number[] = [];
      for (
        let off = pageSize;
        off < first.response.totalBlogs;
        off += pageSize
      ) {
        offsets.push(off);
      }
      const pages = [first.response.blogs];
      const worker = async () => {
        for (
          let off = offsets.shift();
          off !== undefined;
          off = offsets.shift()
        ) {
          const i = off / pageSize;
          pages[i] = (await page(off)).response.blogs;
        }
      };
      await Promise.all(Array.from({ length: concurrency }, worker));
      const now = deps.now();
      return pages.flat().map((b) => ({
        name: b.name,
        url: b.url,
        title: b.title,
        updated: b.updated,
        posts: b.posts,
        followedAt: now - b.durationFollowingBlog,
        oldest: undefined,
      }));
    },

    oldest: async (name: string): Promise<Oldest> => {
      try {
        const res = await call<{
          response: { posts: { timestamp: number }[] };
        }>(deps.apiFetch, `/v2/blog/${encodeURIComponent(name)}/posts`, {
          queryParams: { sort: "asc", limit: 1 },
        });
        const first = res.response.posts[0];
        return first
          ? { kind: "found", ts: first.timestamp }
          : { kind: "empty" };
      } catch (err) {
        if (statusOf(err) === 404) return { kind: "empty" };
        throw err;
      }
    },

    unfollow: async (url: string): Promise<void> => {
      await call(deps.apiFetch, "/v2/user/unfollow", {
        method: "POST",
        body: { url },
      });
    },

    follow: async (url: string): Promise<void> => {
      await call(deps.apiFetch, "/v2/user/follow", {
        method: "POST",
        body: { url },
      });
    },
  };
}

export type TumblrApi = ReturnType<typeof createTumblrApi>;
