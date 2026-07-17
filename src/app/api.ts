import type { FeedPost, Me } from "../shared/types";

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
