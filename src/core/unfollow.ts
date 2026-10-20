import type { Storage } from "./feed-sampling";
import { RateLimitedError } from "./oldest";

export type UnfollowRecord = { name: string; url: string; at: number };

const HISTORY_KEY = "unfollowed";

export async function readHistory(storage: Storage): Promise<UnfollowRecord[]> {
  return (await storage.getJSON<UnfollowRecord[]>(HISTORY_KEY)) ?? [];
}

export async function dropFromHistory(
  storage: Storage,
  name: string,
): Promise<void> {
  const history = await readHistory(storage);
  await storage.putJSON(
    HISTORY_KEY,
    history.filter((r) => r.name !== name),
  );
}

export type UnfollowAllOptions = {
  targets: { name: string; url: string }[];
  unfollow: (url: string) => Promise<void>;
  storage: Storage;
  delayMs: number;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  onEach?: (name: string, ok: boolean) => void;
};

export async function unfollowAll(o: UnfollowAllOptions): Promise<{
  done: string[];
  failed: string[];
  rateLimited: boolean;
}> {
  const done: string[] = [];
  const failed: string[] = [];
  let rateLimited = false;
  for (const [i, target] of o.targets.entries()) {
    if (i > 0) await o.sleep(o.delayMs);
    try {
      await o.unfollow(target.url);
      const history = await readHistory(o.storage);
      await o.storage.putJSON(HISTORY_KEY, [
        { name: target.name, url: target.url, at: o.now() },
        ...history,
      ]);
      done.push(target.name);
      o.onEach?.(target.name, true);
    } catch (err) {
      failed.push(target.name);
      o.onEach?.(target.name, false);
      if (err instanceof RateLimitedError) {
        rateLimited = true;
        break;
      }
    }
  }
  return { done, failed, rateLimited };
}
