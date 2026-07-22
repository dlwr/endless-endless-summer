import { describe, expect, it } from "vitest";
import { deepCamel, toCamel } from "./transform";

describe("toCamel", () => {
  it("snake_case を camelCase に変換する", () => {
    expect(toCamel("blog_name")).toBe("blogName");
  });

  it("連続アンダースコアや数字も扱う", () => {
    expect(toCamel("stream_global_position")).toBe("streamGlobalPosition");
    expect(toCamel("tags_v2")).toBe("tagsV2");
  });

  it("既に camelCase ならそのまま", () => {
    expect(toCamel("objectType")).toBe("objectType");
  });
});

describe("deepCamel", () => {
  it("ネストしたオブジェクトのキーを再帰変換する", () => {
    expect(
      deepCamel({ blog_name: "x", trail: [{ reblog_key: "rk" }] }),
    ).toEqual({ blogName: "x", trail: [{ reblogKey: "rk" }] });
  });

  it("配列・プリミティブ値はキー変換の対象外(値は保持)", () => {
    expect(deepCamel({ tags: ["a_b", "c"] })).toEqual({ tags: ["a_b", "c"] });
  });

  it("null を保持する", () => {
    expect(deepCamel({ recommended_color: null })).toEqual({
      recommendedColor: null,
    });
  });
});
