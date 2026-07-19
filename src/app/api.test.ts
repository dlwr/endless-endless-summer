import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchFeed, RateLimitedError } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchFeed", () => {
  it("429 で retryAt を含む body なら RateLimitedError を throw する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: "rate_limited", retryAt: 1_700_000_000 },
          { status: 429 },
        ),
      ),
    );
    await expect(fetchFeed()).rejects.toBeInstanceOf(RateLimitedError);
  });

  it("RateLimitedError は retryAt を保持する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: "rate_limited", retryAt: 1_700_000_000 },
          { status: 429 },
        ),
      ),
    );
    const error = (await fetchFeed().catch((err) => err)) as RateLimitedError;
    expect(error.retryAt).toBe(1_700_000_000);
  });

  it("429 でも retryAt が無ければ通常のエラーを throw する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 429 })),
    );
    await expect(fetchFeed()).rejects.not.toBeInstanceOf(RateLimitedError);
  });

  it("200 なら posts を返す", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ posts: [] })),
    );
    await expect(fetchFeed()).resolves.toEqual([]);
  });
});
