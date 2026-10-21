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

const blog = (name: string, posts = 1) => ({
  name,
  url: `https://${name}.tumblr.com/`,
  title: name,
  updated: 1_700_000_000,
  posts,
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

  const open = async (blogs: ReturnType<typeof blog>[]) => {
    const api = {
      following: async () => blogs,
      oldest: async () => ({ kind: "empty" }),
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
      expect(rowNames()).toHaveLength(blogs.length);
    });
  };

  const rowNames = () =>
    [...document.querySelectorAll(".ees-cur tbody tr a")].map(
      (a) => a.textContent,
    );

  const rows = () => [
    ...document.querySelectorAll<HTMLTableRowElement>(".ees-cur tbody tr"),
  ];

  const header = (label: string) =>
    [...document.querySelectorAll<HTMLElement>(".ees-cur th")].find((th) =>
      th.textContent?.startsWith(label),
    );

  it("列見出しを押すとその列で並び替える", async () => {
    await open([blog("few", 10), blog("many", 900), blog("mid", 50)]);
    header("ポスト数")?.click();
    expect(rowNames()).toEqual(["many", "mid", "few"]);
  });

  it("同じ列見出しをもう一度押すと昇順と降順を入れ替える", async () => {
    await open([blog("few", 10), blog("many", 900), blog("mid", 50)]);
    header("ポスト数")?.click();
    header("ポスト数")?.click();
    expect(rowNames()).toEqual(["few", "mid", "many"]);
  });

  it("行を押すと選択できる", async () => {
    await open([blog("a"), blog("b"), blog("c")]);
    rows()[1]
      .querySelector("td:nth-child(3)")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(unfollowButton()?.textContent).toBe("選択をアンフォロー (1)");
  });

  it("Shift を押しながら行を押すと範囲で選択する", async () => {
    await open([blog("a"), blog("b"), blog("c"), blog("d")]);
    rows()[0].click();
    rows()[2].dispatchEvent(
      new MouseEvent("click", { bubbles: true, shiftKey: true }),
    );
    expect(unfollowButton()?.textContent).toBe("選択をアンフォロー (3)");
  });

  it("検索欄の語で絞り込む", async () => {
    await open([blog("summer"), blog("winter"), blog("summit")]);
    const search = document.querySelector<HTMLInputElement>(
      ".ees-cur input[type=search]",
    );
    if (!search) throw new Error("search box not found");
    search.value = "sum";
    search.dispatchEvent(new Event("input"));
    expect(rowNames()).toEqual(["summer", "summit"]);
  });
});
