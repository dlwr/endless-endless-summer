import { describe, expect, it, vi } from "vitest";
import type { Oldest } from "./curation";
import type { Storage } from "./feed-sampling";
import { fillOldest, RateLimitedError } from "./oldest";

function memoryStorage(init: Record<string, unknown> = {}): Storage & {
  data: Map<string, unknown>;
} {
  const data = new Map(Object.entries(init));
  return {
    data,
    getJSON: async <T>(k: string) => (data.has(k) ? (data.get(k) as T) : null),
    putJSON: async (k, v) => {
      data.set(k, v);
    },
  };
}

const target = (name: string, posts = 10) => ({ name, posts });

describe("fillOldest", () => {
  it("キャッシュに無いブログだけ取得する", async () => {
    const storage = memoryStorage({
      "first:cached": { kind: "found", ts: 100 },
    });
    const fetchOldest = vi.fn(
      async (_name: string): Promise<Oldest> => ({ kind: "found", ts: 1 }),
    );
    await fillOldest({
      blogs: [target("cached"), target("fresh")],
      storage,
      fetchOldest,
      concurrency: 2,
    });
    expect(fetchOldest.mock.calls.map((c) => c[0])).toEqual(["fresh"]);
  });

  it("キャッシュ済みの値を結果に含める", async () => {
    const storage = memoryStorage({
      "first:cached": { kind: "found", ts: 100 },
    });
    const result = await fillOldest({
      blogs: [target("cached")],
      storage,
      fetchOldest: async () => ({ kind: "empty" }),
      concurrency: 1,
    });
    expect(result.oldest.get("cached")).toEqual({ kind: "found", ts: 100 });
  });

  it("取得した値を永続キャッシュに書く", async () => {
    const storage = memoryStorage();
    await fillOldest({
      blogs: [target("a")],
      storage,
      fetchOldest: async () => ({ kind: "found", ts: 42 }),
      concurrency: 1,
    });
    expect(storage.data.get("first:a")).toEqual({ kind: "found", ts: 42 });
  });

  it("取得した最古日をサンプリング用の下限にも書く", async () => {
    const storage = memoryStorage({ "oldest:a": 10 });
    await fillOldest({
      blogs: [target("a")],
      storage,
      fetchOldest: async () => ({ kind: "found", ts: 42 }),
      concurrency: 1,
    });
    expect(storage.data.get("oldest:a")).toBe(42);
  });

  it("empty キャッシュでも現在のポスト数が正なら取り直す", async () => {
    const storage = memoryStorage({ "first:a": { kind: "empty" } });
    const fetchOldest = vi.fn(
      async (): Promise<Oldest> => ({ kind: "found", ts: 5 }),
    );
    await fillOldest({
      blogs: [target("a", 3)],
      storage,
      fetchOldest,
      concurrency: 1,
    });
    expect(fetchOldest).toHaveBeenCalledWith("a");
  });

  it("empty キャッシュでポスト数が 0 なら取り直さない", async () => {
    const storage = memoryStorage({ "first:a": { kind: "empty" } });
    const fetchOldest = vi.fn(
      async (): Promise<Oldest> => ({ kind: "found", ts: 5 }),
    );
    await fillOldest({
      blogs: [target("a", 0)],
      storage,
      fetchOldest,
      concurrency: 1,
    });
    expect(fetchOldest).not.toHaveBeenCalled();
  });

  it("一時的な失敗はキャッシュに書かない", async () => {
    const storage = memoryStorage();
    await fillOldest({
      blogs: [target("a")],
      storage,
      fetchOldest: async () => {
        throw new Error("500");
      },
      concurrency: 1,
    });
    expect(storage.data.has("first:a")).toBe(false);
  });

  it("一時的な失敗の件数を返す", async () => {
    const result = await fillOldest({
      blogs: [target("a"), target("b"), target("c")],
      storage: memoryStorage(),
      fetchOldest: async (name) => {
        if (name === "b") return { kind: "found", ts: 1 };
        throw new Error("500");
      },
      concurrency: 1,
    });
    expect(result.failed).toBe(2);
  });

  it("レート制限に当たったら残りを取得せずに止める", async () => {
    const fetchOldest = vi.fn(async (name: string): Promise<Oldest> => {
      if (name === "b") throw new RateLimitedError();
      return { kind: "found", ts: 1 };
    });
    const result = await fillOldest({
      blogs: [target("a"), target("b"), target("c"), target("d")],
      storage: memoryStorage(),
      fetchOldest,
      concurrency: 1,
    });
    expect(result.rateLimited).toBe(true);
    expect(fetchOldest.mock.calls.map((c) => c[0])).toEqual(["a", "b"]);
  });

  it("同時実行数を concurrency 以下に保つ", async () => {
    let running = 0;
    let peak = 0;
    await fillOldest({
      blogs: ["a", "b", "c", "d", "e", "f"].map((n) => target(n)),
      storage: memoryStorage(),
      fetchOldest: async () => {
        running++;
        peak = Math.max(peak, running);
        await new Promise((r) => setTimeout(r, 1));
        running--;
        return { kind: "empty" };
      },
      concurrency: 3,
    });
    expect(peak).toBe(3);
  });

  it("取得するたびに onResult を呼ぶ", async () => {
    const onResult = vi.fn();
    await fillOldest({
      blogs: [target("a")],
      storage: memoryStorage(),
      fetchOldest: async () => ({ kind: "found", ts: 9 }),
      concurrency: 1,
      onResult,
    });
    expect(onResult).toHaveBeenCalledWith("a", { kind: "found", ts: 9 });
  });

  it("shouldStop が true になったら残りを取得しない", async () => {
    let stop = false;
    const fetchOldest = vi.fn(async (): Promise<Oldest> => {
      stop = true;
      return { kind: "empty" };
    });
    await fillOldest({
      blogs: [target("a"), target("b"), target("c")],
      storage: memoryStorage(),
      fetchOldest,
      concurrency: 1,
      shouldStop: () => stop,
    });
    expect(fetchOldest).toHaveBeenCalledTimes(1);
  });
});
