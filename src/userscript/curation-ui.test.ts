// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Storage } from "../core/feed-sampling";
import { openCuration } from "./curation-ui";
import type { TumblrApi } from "./tumblr-api";

function memStorage(): Storage {
  const m = new Map<string, unknown>();
  return {
    getJSON: async <T>(k: string) => (m.has(k) ? (m.get(k) as T) : null),
    putJSON: async (k, v) => void m.set(k, v),
  };
}

const blog = (name: string) => ({
  name,
  url: `https://${name}.tumblr.com/`,
  title: name,
  updated: 1_700_000_000,
  posts: 1,
  followedAt: 1_600_000_000,
  oldest: undefined,
});

const unfollowButton = () =>
  [...document.querySelectorAll<HTMLButtonElement>(".ees-cur button")].find(
    (b) => b.textContent?.startsWith("選択をアンフォロー"),
  );

describe("openCuration", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("最古ポスト日の取得中でもチェックすればアンフォローできる", async () => {
    const api = {
      following: async () => [blog("a"), blog("b")],
      oldest: () => new Promise(() => {}),
      unfollow: async () => {},
      follow: async () => {},
    } as unknown as TumblrApi;
    openCuration({
      api,
      storage: memStorage(),
      now: () => 0,
      confirm: () => true,
    });
    await vi.waitFor(() => {
      expect(document.querySelector(".ees-cur tbody input")).not.toBeNull();
    });
    const cb = document.querySelector<HTMLInputElement>(".ees-cur tbody input");
    cb?.click();
    expect(unfollowButton()?.disabled).toBe(false);
  });
});
