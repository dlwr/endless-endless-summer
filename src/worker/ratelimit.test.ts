import { describe, expect, it } from "vitest";
import { RateLimitGuard, readRateHeaders } from "./ratelimit";
import { FakeKV } from "./test-helpers";

const now = 1_750_000_000;

function headersWith(over: Record<string, string> = {}): Headers {
  return new Headers({
    "x-ratelimit-perhour-remaining": "500",
    "x-ratelimit-perday-remaining": "2000",
    "x-ratelimit-perhour-reset": "1800",
    "x-ratelimit-perday-reset": "43200",
    ...over,
  });
}

describe("readRateHeaders", () => {
  it("4 ヘッダーが揃っていれば RateSnapshot を返す", () => {
    const snapshot = readRateHeaders(headersWith(), now);
    expect(snapshot).toEqual({
      hourRemaining: 500,
      dayRemaining: 2000,
      hourResetAt: now + 1800,
      dayResetAt: now + 43200,
    });
  });

  it("perhour-remaining が欠けていれば null を返す", () => {
    const headers = headersWith();
    headers.delete("x-ratelimit-perhour-remaining");
    expect(readRateHeaders(headers, now)).toBeNull();
  });

  it("perday-reset が欠けていれば null を返す", () => {
    const headers = headersWith();
    headers.delete("x-ratelimit-perday-reset");
    expect(readRateHeaders(headers, now)).toBeNull();
  });
});

describe("RateLimitGuard.check", () => {
  it("backoff が設定されていなければ null を返す", async () => {
    const guard = new RateLimitGuard(new FakeKV() as unknown as KVNamespace);
    expect(await guard.check(now)).toBeNull();
  });

  it("backoff 中なら解除時刻を返す", async () => {
    const kv = new FakeKV();
    await kv.put("ratelimit:backoff", JSON.stringify(now + 100));
    const guard = new RateLimitGuard(kv as unknown as KVNamespace);
    expect(await guard.check(now)).toBe(now + 100);
  });

  it("backoff の解除時刻を過ぎていれば null を返す", async () => {
    const kv = new FakeKV();
    await kv.put("ratelimit:backoff", JSON.stringify(now - 1));
    const guard = new RateLimitGuard(kv as unknown as KVNamespace);
    expect(await guard.check(now)).toBeNull();
  });
});

describe("RateLimitGuard.record", () => {
  it("snapshot が null なら backoff を設定しない", async () => {
    const kv = new FakeKV();
    const guard = new RateLimitGuard(kv as unknown as KVNamespace);
    await guard.record(null, now);
    expect(await guard.check(now)).toBeNull();
  });

  it("残量が閾値以上なら backoff を設定しない", async () => {
    const kv = new FakeKV();
    const guard = new RateLimitGuard(kv as unknown as KVNamespace);
    await guard.record(
      {
        hourRemaining: 500,
        dayRemaining: 2000,
        hourResetAt: now + 1800,
        dayResetAt: now + 43200,
      },
      now,
    );
    expect(await guard.check(now)).toBeNull();
  });

  it("hourRemaining が 100 未満なら hourResetAt まで backoff を設定する", async () => {
    const kv = new FakeKV();
    const guard = new RateLimitGuard(kv as unknown as KVNamespace);
    await guard.record(
      {
        hourRemaining: 99,
        dayRemaining: 2000,
        hourResetAt: now + 1800,
        dayResetAt: now + 43200,
      },
      now,
    );
    expect(await guard.check(now)).toBe(now + 1800);
  });

  it("dayRemaining が 300 未満なら dayResetAt まで backoff を設定する", async () => {
    const kv = new FakeKV();
    const guard = new RateLimitGuard(kv as unknown as KVNamespace);
    await guard.record(
      {
        hourRemaining: 500,
        dayRemaining: 299,
        hourResetAt: now + 1800,
        dayResetAt: now + 43200,
      },
      now,
    );
    expect(await guard.check(now)).toBe(now + 43200);
  });

  it("両方の閾値を割り込んだら遅い方の reset 時刻まで backoff を設定する", async () => {
    const kv = new FakeKV();
    const guard = new RateLimitGuard(kv as unknown as KVNamespace);
    await guard.record(
      {
        hourRemaining: 10,
        dayRemaining: 10,
        hourResetAt: now + 1800,
        dayResetAt: now + 43200,
      },
      now,
    );
    expect(await guard.check(now)).toBe(now + 43200);
  });
});

describe("RateLimitGuard.trip", () => {
  it("デフォルトでは now + 300 秒で backoff を設定する", async () => {
    const kv = new FakeKV();
    const guard = new RateLimitGuard(kv as unknown as KVNamespace);
    await guard.trip(now);
    expect(await guard.check(now)).toBe(now + 300);
  });

  it("seconds を指定するとその秒数で backoff を設定する", async () => {
    const kv = new FakeKV();
    const guard = new RateLimitGuard(kv as unknown as KVNamespace);
    await guard.trip(now, 60);
    expect(await guard.check(now)).toBe(now + 60);
  });
});

describe("RateLimitGuard.record - redundant write optimization", () => {
  it("同じ snapshot で 2 回 record しても KV put は 1 回だけ", async () => {
    const kv = new FakeKV();
    let putCount = 0;
    const originalPut = kv.put.bind(kv);
    kv.put = async (
      key: string,
      value: string,
      opts?: { expirationTtl?: number },
    ) => {
      putCount++;
      return originalPut(key, value, opts);
    };

    const snapshot = {
      hourRemaining: 10,
      dayRemaining: 10,
      hourResetAt: now + 1800,
      dayResetAt: now + 43200,
    };

    const guard = new RateLimitGuard(kv as unknown as KVNamespace);
    await guard.record(snapshot, now);
    await guard.record(snapshot, now);

    expect(putCount).toBe(1);
  });
});
