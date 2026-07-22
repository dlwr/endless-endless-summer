import type { Storage } from "../core/feed-sampling";

type Entry = { v: unknown; exp: number | null };

declare const GM_getValue: ((k: string, d?: string) => string) | undefined;
declare const GM_setValue: ((k: string, v: string) => void) | undefined;

export function createStorage(deps?: { now?: () => number }): Storage {
  const now = deps?.now ?? (() => Math.floor(Date.now() / 1000));
  const hasGM =
    typeof GM_getValue === "function" && typeof GM_setValue === "function";
  const readRaw = (k: string): string | null =>
    hasGM ? GM_getValue?.(k, "") || null : localStorage.getItem(k);
  const writeRaw = (k: string, v: string): void => {
    if (hasGM) GM_setValue?.(k, v);
    else localStorage.setItem(k, v);
  };

  return {
    getJSON: async <T>(key: string): Promise<T | null> => {
      const raw = readRaw(`ees:${key}`);
      if (!raw) return null;
      const entry = JSON.parse(raw) as Entry;
      if (entry.exp !== null && entry.exp < now()) return null;
      return entry.v as T;
    },
    putJSON: async (key, value, ttlSeconds) => {
      const entry: Entry = {
        v: value,
        exp: ttlSeconds ? now() + ttlSeconds : null,
      };
      writeRaw(`ees:${key}`, JSON.stringify(entry));
    },
  };
}
