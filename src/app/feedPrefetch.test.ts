import { afterEach, describe, expect, it, vi } from "vitest";
import { startFeedPrefetch, takeFeedPrefetch } from "./feedPrefetch";

afterEach(() => {
  // 未消費のまま残ったモジュール状態が他のテストへ漏れないようにする。
  takeFeedPrefetch()?.catch(() => {});
  vi.unstubAllGlobals();
});

describe("feedPrefetch", () => {
  it("takeFeedPrefetch は開始済みの prefetch を一度しか返さない", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ posts: [] })),
    );
    startFeedPrefetch();
    const first = takeFeedPrefetch();
    const second = takeFeedPrefetch();
    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it("開始前に takeFeedPrefetch を呼ぶと null を返す", () => {
    expect(takeFeedPrefetch()).toBeNull();
  });
});
