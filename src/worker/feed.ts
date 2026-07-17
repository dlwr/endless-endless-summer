import type { FeedPost, NpfBlock, PostKind, TrailItem } from "../shared/types";
import { type Rng, sampleTimestamp, TUMBLR_EPOCH } from "./sampling";
import type { RawPost, TumblrClient } from "./tumblr";

export const SAMPLES_PER_BATCH = 6;
export const POSTS_PER_SAMPLE = 2;
export const FOLLOWING_TTL = 3600;

export type FeedClient = Pick<TumblrClient, "following" | "posts">;

export function deriveKind(blocks: NpfBlock[]): PostKind {
  const types = new Set(blocks.map((b) => b.type));
  if (types.has("video")) return "video";
  if (types.has("audio")) return "audio";
  if (types.has("image")) return "image";
  if (types.has("link")) return "link";
  return "text";
}

type RawTrailItem = { blog?: { name?: string }; content?: NpfBlock[] };

export function normalizePost(raw: RawPost): FeedPost {
  const content = (raw.content ?? []) as NpfBlock[];
  const trail: TrailItem[] = ((raw.trail ?? []) as RawTrailItem[]).map((t) => ({
    blogName: t.blog?.name ?? "",
    content: t.content ?? [],
  }));
  return {
    id: String(raw.id_string),
    blogName: String(raw.blog_name),
    postUrl: String(raw.post_url),
    timestamp: Number(raw.timestamp),
    tags: (raw.tags ?? []) as string[],
    reblogKey: String(raw.reblog_key),
    liked: Boolean(raw.liked),
    kind: deriveKind([...content, ...trail.flatMap((t) => t.content)]),
    content,
    trail,
  };
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

async function cachedFollowing(
  client: FeedClient,
  kv: KVNamespace,
  userName: string,
): Promise<{ name: string }[]> {
  const key = `following:${userName}`;
  const cached = (await kv.get(key, "json")) as { name: string }[] | null;
  if (cached) return cached;
  const blogs = await client.following();
  await kv.put(key, JSON.stringify(blogs), { expirationTtl: FOLLOWING_TTL });
  return blogs;
}

export async function buildFeed(
  client: FeedClient,
  kv: KVNamespace,
  userName: string,
  rng: Rng,
  now: number,
): Promise<FeedPost[]> {
  const following = await cachedFollowing(client, kv, userName);
  if (following.length === 0) return [];

  const samples = Array.from(
    { length: SAMPLES_PER_BATCH },
    () => following[Math.floor(rng() * following.length)],
  );

  const batches = await Promise.all(
    samples.map(async (blog) => {
      const boundKey = `oldest:${blog.name}`;
      const notBefore =
        ((await kv.get(boundKey, "json")) as number | null) ?? TUMBLR_EPOCH;
      const before = sampleTimestamp(notBefore, now, rng);
      const posts = await client.posts(blog.name, before, POSTS_PER_SAMPLE);
      if (posts.length === 0) {
        // 「before 以前にポストは無い」と学習し、次回以降のサンプル範囲を狭める
        await kv.put(boundKey, JSON.stringify(before));
        return [];
      }
      return posts.map(normalizePost);
    }),
  );

  return shuffle(batches.flat(), rng);
}
