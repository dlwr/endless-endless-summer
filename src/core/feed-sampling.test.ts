import { describe, expect, it } from "vitest";
import { type FeedClient, type Storage, sampleFeed } from "./feed-sampling";

function memStorage(): Storage {
  const m = new Map<string, unknown>();
  return {
    getJSON: async <T>(k: string) => (m.has(k) ? (m.get(k) as T) : null),
    putJSON: async (k, v) => void m.set(k, v),
  };
}

const seq = (values: number[]): (() => number) => {
  let i = 0;
  return () => values[i++ % values.length];
};

const client = (posts: Record<string, unknown>[]): FeedClient => ({
  following: async () => [{ name: "a" }, { name: "b" }, { name: "c" }],
  posts: async () => posts,
});

describe("sampleFeed", () => {
  it("フォローが空なら空配列を返す", async () => {
    const empty: FeedClient = {
      following: async () => [],
      posts: async () => [],
    };
    const got = await sampleFeed({
      client: empty,
      storage: memStorage(),
      userName: "me",
      rng: seq([0.1]),
      now: 1_700_000_000,
      samplesPerBatch: 4,
      postsPerSample: 2,
      followingTtl: 3600,
    });
    expect(got).toEqual([]);
  });

  it("取得した生ポストを(正規化せず)返す", async () => {
    const got = await sampleFeed({
      client: client([{ id_string: "1" }, { id_string: "2" }]),
      storage: memStorage(),
      userName: "me",
      rng: seq([0.1, 0.2, 0.3]),
      now: 1_700_000_000,
      samplesPerBatch: 1,
      postsPerSample: 2,
      followingTtl: 3600,
    });
    expect(got.map((p) => p.id_string).sort()).toEqual(["1", "2"]);
  });

  it("posts が空なら最古境界を storage に学習する", async () => {
    const storage = memStorage();
    await sampleFeed({
      client: { following: async () => [{ name: "a" }], posts: async () => [] },
      storage,
      userName: "me",
      rng: seq([0.5, 0.5]),
      now: 1_700_000_000,
      samplesPerBatch: 1,
      postsPerSample: 2,
      followingTtl: 3600,
    });
    expect(await storage.getJSON<number>("oldest:a")).toBeTypeOf("number");
  });

  it("following の updated があれば before はそれを超えない", async () => {
    const updated = Date.UTC(2015, 2, 8) / 1000;
    const befores: number[] = [];
    await sampleFeed({
      client: {
        following: async () => [{ name: "a", updated }],
        posts: async (_blog, before) => {
          befores.push(before);
          return [{ id_string: "1" }];
        },
      },
      storage: memStorage(),
      userName: "me",
      rng: seq([0.999, 0.999]),
      now: Date.UTC(2026, 8, 18) / 1000,
      samplesPerBatch: 1,
      postsPerSample: 1,
      followingTtl: 3600,
    });
    expect(befores[0]).toBeLessThanOrEqual(updated + 1);
  });

  it("updated が学習済み最古境界より前でも before は境界を下回らない", async () => {
    const storage = memStorage();
    const oldest = Date.UTC(2016, 0, 1) / 1000;
    await storage.putJSON("oldest:a", oldest);
    const befores: number[] = [];
    await sampleFeed({
      client: {
        following: async () => [
          { name: "a", updated: Date.UTC(2015, 0, 1) / 1000 },
        ],
        posts: async (_blog, before) => {
          befores.push(before);
          return [{ id_string: "1" }];
        },
      },
      storage,
      userName: "me",
      rng: seq([0.5, 0.5]),
      now: Date.UTC(2026, 8, 18) / 1000,
      samplesPerBatch: 1,
      postsPerSample: 1,
      followingTtl: 3600,
    });
    expect(befores[0]).toBeGreaterThanOrEqual(oldest);
  });

  it("isFatal に該当するエラーは即時 throw する", async () => {
    const fatal = new Error("rate limited");
    await expect(
      sampleFeed({
        client: {
          following: async () => [{ name: "a" }],
          posts: async () => {
            throw fatal;
          },
        },
        storage: memStorage(),
        userName: "me",
        rng: seq([0.5, 0.5]),
        now: 1_700_000_000,
        samplesPerBatch: 1,
        postsPerSample: 2,
        followingTtl: 3600,
        isFatal: (e) => e === fatal,
      }),
    ).rejects.toBe(fatal);
  });
});

describe("sampleFeed の重複排除", () => {
  const base = {
    userName: "me",
    rng: seq([0.1, 0.5, 0.9]),
    now: 1_700_000_000,
    postsPerSample: 2,
    followingTtl: 3600,
  };

  it("seen に含まれる id_string のポストを除外する", async () => {
    const got = await sampleFeed({
      ...base,
      storage: memStorage(),
      client: client([{ id_string: "1" }, { id_string: "2" }]),
      samplesPerBatch: 1,
      seen: new Set(["1"]),
    });
    expect(got.map((p) => p.id_string)).toEqual(["2"]);
  });

  it("同じバッチ内で重複したポストは1件にまとめる", async () => {
    const got = await sampleFeed({
      ...base,
      storage: memStorage(),
      client: client([{ id_string: "1" }, { id_string: "2" }]),
      samplesPerBatch: 3,
      seen: new Set(),
      maxRounds: 1,
    });
    expect(got.map((p) => p.id_string).sort()).toEqual(["1", "2"]);
  });

  it("返したポストを seen に登録する", async () => {
    const seen = new Set<string>();
    await sampleFeed({
      ...base,
      storage: memStorage(),
      client: client([{ id_string: "1" }, { id_string: "2" }]),
      samplesPerBatch: 1,
      seen,
    });
    expect([...seen].sort()).toEqual(["1", "2"]);
  });

  it("新規ポストが minPosts に届くまで再サンプルする", async () => {
    let n = 0;
    const got = await sampleFeed({
      ...base,
      storage: memStorage(),
      client: {
        following: async () => [{ name: "a" }],
        posts: async () => {
          n++;
          return n === 1 ? [{ id_string: "old" }] : [{ id_string: `new${n}` }];
        },
      },
      samplesPerBatch: 1,
      seen: new Set(["old"]),
      minPosts: 1,
      maxRounds: 3,
    });
    expect(got.map((p) => p.id_string)).toEqual(["new2"]);
  });

  it("再サンプルは maxRounds で打ち切る", async () => {
    let calls = 0;
    await sampleFeed({
      ...base,
      storage: memStorage(),
      client: {
        following: async () => [{ name: "a" }],
        posts: async () => {
          calls++;
          return [{ id_string: "old" }];
        },
      },
      samplesPerBatch: 1,
      seen: new Set(["old"]),
      minPosts: 1,
      maxRounds: 3,
    });
    expect(calls).toBe(3);
  });
});
