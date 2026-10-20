import { describe, expect, it, vi } from "vitest";
import type { Storage } from "./feed-sampling";
import { RateLimitedError } from "./oldest";
import {
  dropFromHistory,
  readHistory,
  type UnfollowRecord,
  unfollowAll,
} from "./unfollow";

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

const t = (name: string) => ({ name, url: `https://${name}.tumblr.com/` });
const noSleep = async () => {};

describe("unfollowAll", () => {
  it("1件ずつ順番にアンフォローする", async () => {
    const unfollow = vi.fn(async (_url: string) => {});
    await unfollowAll({
      targets: [t("a"), t("b"), t("c")],
      unfollow,
      storage: memoryStorage(),
      delayMs: 0,
      sleep: noSleep,
      now: () => 1,
    });
    expect(unfollow.mock.calls.map((c) => c[0])).toEqual([
      "https://a.tumblr.com/",
      "https://b.tumblr.com/",
      "https://c.tumblr.com/",
    ]);
  });

  it("各アンフォローの間で delayMs 待つ", async () => {
    const sleep = vi.fn(async () => {});
    await unfollowAll({
      targets: [t("a"), t("b"), t("c")],
      unfollow: async () => {},
      storage: memoryStorage(),
      delayMs: 1500,
      sleep,
      now: () => 1,
    });
    expect(sleep.mock.calls).toEqual([[1500], [1500]]);
  });

  it("成功したブログを新しい順に履歴へ残す", async () => {
    let clock = 100;
    const storage = memoryStorage({
      unfollowed: [{ name: "old", url: "u", at: 1 }],
    });
    await unfollowAll({
      targets: [t("a"), t("b")],
      unfollow: async () => {},
      storage,
      delayMs: 0,
      sleep: noSleep,
      now: () => clock++,
    });
    expect((await readHistory(storage)).map((r) => r.name)).toEqual([
      "b",
      "a",
      "old",
    ]);
  });

  it("失敗したブログは履歴に残さず続行する", async () => {
    const storage = memoryStorage();
    const result = await unfollowAll({
      targets: [t("a"), t("b"), t("c")],
      unfollow: async (url) => {
        if (url === t("b").url) throw new Error("500");
      },
      storage,
      delayMs: 0,
      sleep: noSleep,
      now: () => 1,
    });
    expect(result.failed).toEqual(["b"]);
  });

  it("成功したブログ名を返す", async () => {
    const result = await unfollowAll({
      targets: [t("a"), t("b"), t("c")],
      unfollow: async (url) => {
        if (url === t("b").url) throw new Error("500");
      },
      storage: memoryStorage(),
      delayMs: 0,
      sleep: noSleep,
      now: () => 1,
    });
    expect(result.done).toEqual(["a", "c"]);
  });

  it("レート制限に当たったら残りを実行せずに止める", async () => {
    const unfollow = vi.fn(async (url: string) => {
      if (url === t("b").url) throw new RateLimitedError();
    });
    const result = await unfollowAll({
      targets: [t("a"), t("b"), t("c")],
      unfollow,
      storage: memoryStorage(),
      delayMs: 0,
      sleep: noSleep,
      now: () => 1,
    });
    expect(result.rateLimited).toBe(true);
    expect(unfollow).toHaveBeenCalledTimes(2);
  });

  it("1件終わるたびに onEach を呼ぶ", async () => {
    const onEach = vi.fn();
    await unfollowAll({
      targets: [t("a")],
      unfollow: async () => {},
      storage: memoryStorage(),
      delayMs: 0,
      sleep: noSleep,
      now: () => 1,
      onEach,
    });
    expect(onEach).toHaveBeenCalledWith("a", true);
  });
});

describe("dropFromHistory", () => {
  it("指定したブログを履歴から消す", async () => {
    const history: UnfollowRecord[] = [
      { name: "a", url: "ua", at: 3 },
      { name: "b", url: "ub", at: 2 },
      { name: "c", url: "uc", at: 1 },
    ];
    const storage = memoryStorage({ unfollowed: history });
    await dropFromHistory(storage, "b");
    expect((await readHistory(storage)).map((r) => r.name)).toEqual(["a", "c"]);
  });
});
