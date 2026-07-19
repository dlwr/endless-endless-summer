import type { FeedPost, Me } from "../shared/types";

// /api/feed が Tumblr の API 予算切れ(RateLimitGuard による backoff)を理由に
// 429 を返したときに throw される。retryAt(Unix 秒)を保持し、呼び出し側が
// 通常のエラーと区別して「休憩表示」を出せるようにする。
export class RateLimitedError extends Error {
  constructor(public retryAt: number) {
    super("rate limited");
    this.name = "RateLimitedError";
  }
}

async function postJson(path: string, body: unknown): Promise<void> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
}

export async function fetchMe(): Promise<Me | null> {
  const res = await fetch("/api/me");
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`/api/me failed: ${res.status}`);
  return (await res.json()) as Me;
}

export async function fetchFeed(): Promise<FeedPost[]> {
  const res = await fetch("/api/feed");
  if (res.status === 429) {
    const errorBody = (await res.json().catch(() => null)) as {
      retryAt?: number;
    } | null;
    if (errorBody && typeof errorBody.retryAt === "number") {
      throw new RateLimitedError(errorBody.retryAt);
    }
  }
  if (!res.ok) throw new Error(`/api/feed failed: ${res.status}`);
  const body = (await res.json()) as { posts: FeedPost[] };
  return body.posts;
}

export function likePost(
  id: string,
  reblogKey: string,
  like: boolean,
): Promise<void> {
  return postJson("/api/like", { id, reblogKey, like });
}

export function reblogPost(input: {
  id: string;
  reblogKey: string;
  blogName?: string;
  comment?: string;
  tags?: string;
}): Promise<void> {
  return postJson("/api/reblog", input);
}
