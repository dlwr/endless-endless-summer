import { describe, expect, it } from "vitest";
import { type CurationBlog, sortCandidates } from "./curation";

const blog = (
  name: string,
  oldest: CurationBlog["oldest"],
  extra: Partial<CurationBlog> = {},
): CurationBlog => ({
  name,
  url: `https://${name}.tumblr.com/`,
  title: name,
  updated: 0,
  posts: 1,
  followedAt: 0,
  oldest,
  ...extra,
});

const names = (blogs: CurationBlog[]) => blogs.map((b) => b.name);

describe("sortCandidates", () => {
  it("最古ポスト日が新しい順に並べる", () => {
    const got = sortCandidates(
      [
        blog("b2010", { kind: "found", ts: 1_262_304_000 }),
        blog("b2020", { kind: "found", ts: 1_577_836_800 }),
        blog("b2015", { kind: "found", ts: 1_420_070_400 }),
      ],
      new Set(),
    );
    expect(names(got)).toEqual(["b2020", "b2015", "b2010"]);
  });

  it("ポストが無いブログを先頭に置く", () => {
    const got = sortCandidates(
      [
        blog("old", { kind: "found", ts: 1_262_304_000 }),
        blog("empty", { kind: "empty" }),
        blog("new", { kind: "found", ts: 1_577_836_800 }),
      ],
      new Set(),
    );
    expect(names(got)).toEqual(["empty", "new", "old"]);
  });

  it("最古ポスト日が未取得のブログは取得済みの後ろに置く", () => {
    const got = sortCandidates(
      [
        blog("unknown", undefined),
        blog("old", { kind: "found", ts: 1_262_304_000 }),
        blog("new", { kind: "found", ts: 1_577_836_800 }),
      ],
      new Set(),
    );
    expect(names(got)).toEqual(["new", "old", "unknown"]);
  });

  it("保護したブログは最後尾に沈める", () => {
    const got = sortCandidates(
      [
        blog("newest-protected", { kind: "found", ts: 1_600_000_000 }),
        blog("unknown", undefined),
        blog("old", { kind: "found", ts: 1_262_304_000 }),
      ],
      new Set(["newest-protected"]),
    );
    expect(names(got)).toEqual(["old", "unknown", "newest-protected"]);
  });

  it("保護したブログ同士も最古ポスト日が新しい順に並べる", () => {
    const got = sortCandidates(
      [
        blog("p2010", { kind: "found", ts: 1_262_304_000 }),
        blog("p2020", { kind: "found", ts: 1_577_836_800 }),
        blog("p2015", { kind: "found", ts: 1_420_070_400 }),
      ],
      new Set(["p2010", "p2020", "p2015"]),
    );
    expect(names(got)).toEqual(["p2020", "p2015", "p2010"]);
  });

  it("入力配列を変更しない", () => {
    const input = [
      blog("a", { kind: "found", ts: 1 }),
      blog("b", { kind: "found", ts: 3 }),
      blog("c", { kind: "found", ts: 2 }),
    ];
    sortCandidates(input, new Set());
    expect(names(input)).toEqual(["a", "b", "c"]);
  });
});
