import {
  type FeedClient as CoreFeedClient,
  type RawPost,
  type Storage,
  sampleFeed,
} from "../core/feed-sampling";
import type { FeedPost, NpfBlock, PostKind, TrailItem } from "../shared/types";
import { TumblrRateLimitError } from "./tumblr";

// Tumblr consumer key の呼び出し予算(1,000/時・5,000/日、全ユーザー共有)を
// 節約するため、1 バッチあたりのサンプル数を控えめにしている。
export const SAMPLES_PER_BATCH = 4;
export const POSTS_PER_SAMPLE = 2;
export const FOLLOWING_TTL = 3600;

export type FeedClient = CoreFeedClient;

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

function kvStorage(kv: KVNamespace): Storage {
  return {
    getJSON: <T>(key: string) => kv.get(key, "json") as Promise<T | null>,
    putJSON: (key, value, ttlSeconds) =>
      kv.put(
        key,
        JSON.stringify(value),
        ttlSeconds ? { expirationTtl: ttlSeconds } : undefined,
      ),
  };
}

export async function buildFeed(
  client: FeedClient,
  kv: KVNamespace,
  userName: string,
  rng: () => number,
  now: number,
): Promise<FeedPost[]> {
  const raw = await sampleFeed({
    client,
    storage: kvStorage(kv),
    userName,
    rng,
    now,
    samplesPerBatch: SAMPLES_PER_BATCH,
    postsPerSample: POSTS_PER_SAMPLE,
    followingTtl: FOLLOWING_TTL,
    isFatal: (err) => err instanceof TumblrRateLimitError,
  });
  return raw.map(normalizePost);
}
