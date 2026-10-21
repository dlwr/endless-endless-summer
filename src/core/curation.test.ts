import { describe, expect, it } from "vitest";
import { type CurationBlog, filterBlogs, sortCandidates } from "./curation";

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

describe("sortCandidates の並び替え指定", () => {
  const found = (ts: number) => ({ kind: "found", ts }) as const;

  it("最古ポスト日の昇順では古い順に並べ、ポストなしをその後ろに置く", () => {
    const got = sortCandidates(
      [
        blog("new", found(1_577_836_800)),
        blog("empty", { kind: "empty" }),
        blog("old", found(1_262_304_000)),
      ],
      new Set(),
      { key: "oldest", dir: "asc" },
    );
    expect(names(got)).toEqual(["old", "new", "empty"]);
  });

  it("最古ポスト日の昇順でも未取得は最後に置く", () => {
    const got = sortCandidates(
      [
        blog("unknown", undefined),
        blog("new", found(1_577_836_800)),
        blog("old", found(1_262_304_000)),
      ],
      new Set(),
      { key: "oldest", dir: "asc" },
    );
    expect(names(got)).toEqual(["old", "new", "unknown"]);
  });

  it("ポスト数の降順に並べる", () => {
    const got = sortCandidates(
      [
        blog("few", undefined, { posts: 10 }),
        blog("many", undefined, { posts: 900 }),
        blog("mid", undefined, { posts: 50 }),
      ],
      new Set(),
      { key: "posts", dir: "desc" },
    );
    expect(names(got)).toEqual(["many", "mid", "few"]);
  });

  it("最終ポスト日の昇順に並べる", () => {
    const got = sortCandidates(
      [
        blog("mid", undefined, { updated: 200 }),
        blog("new", undefined, { updated: 300 }),
        blog("old", undefined, { updated: 100 }),
      ],
      new Set(),
      { key: "updated", dir: "asc" },
    );
    expect(names(got)).toEqual(["old", "mid", "new"]);
  });

  it("フォロー日の降順に並べる", () => {
    const got = sortCandidates(
      [
        blog("mid", undefined, { followedAt: 200 }),
        blog("old", undefined, { followedAt: 100 }),
        blog("new", undefined, { followedAt: 300 }),
      ],
      new Set(),
      { key: "followedAt", dir: "desc" },
    );
    expect(names(got)).toEqual(["new", "mid", "old"]);
  });

  it("ブログ名の昇順に並べる", () => {
    const got = sortCandidates(
      [
        blog("charlie", undefined),
        blog("alpha", undefined),
        blog("bravo", undefined),
      ],
      new Set(),
      { key: "name", dir: "asc" },
    );
    expect(names(got)).toEqual(["alpha", "bravo", "charlie"]);
  });

  it("どの並び替えでも保護したブログは最後尾に沈める", () => {
    const got = sortCandidates(
      [
        blog("many-protected", undefined, { posts: 900 }),
        blog("few", undefined, { posts: 10 }),
        blog("mid", undefined, { posts: 50 }),
      ],
      new Set(["many-protected"]),
      { key: "posts", dir: "desc" },
    );
    expect(names(got)).toEqual(["mid", "few", "many-protected"]);
  });
});

describe("filterBlogs", () => {
  const blogs = [
    blog("summer-photo", undefined, { title: "夏の写真" }),
    blog("noise-tape", undefined, { title: "Tape Archive" }),
    blog("kyoto", undefined, { title: "京都の夏" }),
  ];

  it("ブログ名の部分一致で絞り込む", () => {
    expect(names(filterBlogs(blogs, "photo"))).toEqual(["summer-photo"]);
  });

  it("タイトルを大文字小文字を区別せずに絞り込む", () => {
    expect(names(filterBlogs(blogs, "archive"))).toEqual(["noise-tape"]);
  });

  it("日本語のタイトルでも絞り込む", () => {
    expect(names(filterBlogs(blogs, "夏"))).toEqual(["summer-photo", "kyoto"]);
  });

  it("空白だけの検索語なら全件を返す", () => {
    expect(filterBlogs(blogs, "  ")).toHaveLength(3);
  });
});
