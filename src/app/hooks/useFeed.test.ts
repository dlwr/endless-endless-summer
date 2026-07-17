import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FeedPost } from "../../shared/types";
import { useFeed } from "./useFeed";

const post = (id: string): FeedPost => ({
  id,
  blogName: "b",
  postUrl: `https://b.tumblr.com/post/${id}`,
  timestamp: 1_500_000_000,
  tags: [],
  reblogKey: "rk",
  liked: false,
  kind: "text",
  content: [{ type: "text", text: id }],
  trail: [],
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFeedBatches(batches: FeedPost[][]) {
  let call = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ posts: batches[Math.min(call++, batches.length - 1)] }),
    ),
  );
}

describe("useFeed", () => {
  it("loadMore でポストが末尾に追記される", async () => {
    stubFeedBatches([[post("1")], [post("2")]]);
    const { result } = renderHook(() => useFeed());
    await act(() => result.current.loadMore());
    await act(() => result.current.loadMore());
    expect(result.current.posts.map((p) => p.id)).toEqual(["1", "2"]);
  });

  it("ロード中の loadMore は多重発火しない", async () => {
    stubFeedBatches([[post("1")]]);
    const { result } = renderHook(() => useFeed());
    await act(async () => {
      await Promise.all([result.current.loadMore(), result.current.loadMore()]);
    });
    expect(vi.mocked(fetch).mock.calls.length).toBe(1);
  });

  it("reroll は既存ポストを捨てて取り直す", async () => {
    stubFeedBatches([[post("1")], [post("2")]]);
    const { result } = renderHook(() => useFeed());
    await act(() => result.current.loadMore());
    await act(() => result.current.reroll());
    await waitFor(() => {
      expect(result.current.posts.map((p) => p.id)).toEqual(["2"]);
    });
  });
});
