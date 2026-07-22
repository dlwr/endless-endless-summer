import { type Rng, sampleTimestamp, TUMBLR_EPOCH } from "./sampling";

export type RawPost = Record<string, unknown>;
export type FollowingBlog = { name: string };
export type FeedClient = {
  following(): Promise<FollowingBlog[]>;
  posts(blogName: string, before: number, limit: number): Promise<RawPost[]>;
};
export type Storage = {
  getJSON<T>(key: string): Promise<T | null>;
  putJSON(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
};
export type SampleFeedOptions = {
  client: FeedClient;
  storage: Storage;
  userName: string;
  rng: Rng;
  now: number;
  samplesPerBatch: number;
  postsPerSample: number;
  followingTtl: number;
  isFatal?: (err: unknown) => boolean;
};

function shuffle<T>(items: T[], rng: Rng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

async function cachedFollowing(o: SampleFeedOptions): Promise<FollowingBlog[]> {
  const key = `following:${o.userName}`;
  const cached = await o.storage.getJSON<FollowingBlog[]>(key);
  if (cached) return cached;
  const blogs = await o.client.following();
  await o.storage.putJSON(key, blogs, o.followingTtl);
  return blogs;
}

export async function sampleFeed(o: SampleFeedOptions): Promise<RawPost[]> {
  const following = await cachedFollowing(o);
  if (following.length === 0) return [];

  const samples = Array.from(
    { length: o.samplesPerBatch },
    () => following[Math.floor(o.rng() * following.length)],
  );

  const results = await Promise.all(
    samples.map(async (blog) => {
      const boundKey = `oldest:${blog.name}`;
      const notBefore =
        (await o.storage.getJSON<number>(boundKey)) ?? TUMBLR_EPOCH;
      const before = sampleTimestamp(notBefore, o.now, o.rng);
      try {
        const posts = await o.client.posts(blog.name, before, o.postsPerSample);
        if (posts.length === 0) {
          await o.storage.putJSON(boundKey, before);
          return { ok: true, posts: [] as RawPost[] };
        }
        return { ok: true, posts };
      } catch (err) {
        if (o.isFatal?.(err)) throw err;
        return { ok: false, posts: [] as RawPost[] };
      }
    }),
  );

  if (results.every((r) => !r.ok)) throw new Error("all feed samples failed");
  return shuffle(
    results.flatMap((r) => r.posts),
    o.rng,
  );
}
