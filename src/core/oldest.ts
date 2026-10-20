import type { Oldest } from "./curation";
import type { Storage } from "./feed-sampling";

export class RateLimitedError extends Error {
  constructor() {
    super("rate limited");
  }
}

export type FillOldestOptions = {
  blogs: { name: string; posts: number }[];
  storage: Storage;
  fetchOldest: (name: string) => Promise<Oldest>;
  concurrency: number;
  onResult?: (name: string, oldest: Oldest) => void;
  shouldStop?: () => boolean;
};

export type FillOldestResult = {
  oldest: Map<string, Oldest>;
  pending: number;
  failed: number;
  rateLimited: boolean;
};

const needsFetch = (cached: Oldest | null, posts: number): boolean =>
  !cached || (cached.kind === "empty" && posts > 0);

export async function fillOldest(
  o: FillOldestOptions,
): Promise<FillOldestResult> {
  const oldest = new Map<string, Oldest>();
  const queue: string[] = [];
  for (const blog of o.blogs) {
    const cached = await o.storage.getJSON<Oldest>(`first:${blog.name}`);
    if (cached) oldest.set(blog.name, cached);
    if (needsFetch(cached, blog.posts)) queue.push(blog.name);
  }

  let failed = 0;
  let rateLimited = false;
  const worker = async () => {
    while (!rateLimited && !o.shouldStop?.()) {
      const name = queue.shift();
      if (name === undefined) return;
      try {
        const got = await o.fetchOldest(name);
        await o.storage.putJSON(`first:${name}`, got);
        if (got.kind === "found") {
          await o.storage.putJSON(`oldest:${name}`, got.ts);
        }
        oldest.set(name, got);
        o.onResult?.(name, got);
      } catch (err) {
        if (err instanceof RateLimitedError) rateLimited = true;
        else failed++;
      }
    }
  };
  await Promise.all(Array.from({ length: o.concurrency }, worker));
  return { oldest, pending: queue.length, failed, rateLimited };
}
