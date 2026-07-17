import { describe, expect, it } from "vitest";
import { resolveShortcut } from "./shortcuts";

const key = (
  k: string,
  mods: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean }> = {},
) => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  ...mods,
});

describe("resolveShortcut", () => {
  it("j は next", () => {
    expect(resolveShortcut(key("j"))).toBe("next");
  });

  it("k は prev", () => {
    expect(resolveShortcut(key("k"))).toBe("prev");
  });

  it("t は reblog", () => {
    expect(resolveShortcut(key("t"))).toBe("reblog");
  });

  it("T(shift+t)は reblogDialog", () => {
    expect(resolveShortcut(key("T"))).toBe("reblogDialog");
  });

  it("l は like", () => {
    expect(resolveShortcut(key("l"))).toBe("like");
  });

  it("o は open", () => {
    expect(resolveShortcut(key("o"))).toBe("open");
  });

  it("r は reroll", () => {
    expect(resolveShortcut(key("r"))).toBe("reroll");
  });

  it("? は help", () => {
    expect(resolveShortcut(key("?"))).toBe("help");
  });

  it("cmd+r のような修飾キー付きは無視する", () => {
    expect(resolveShortcut(key("r", { metaKey: true }))).toBeNull();
  });

  it("未定義キーは null", () => {
    expect(resolveShortcut(key("x"))).toBeNull();
  });
});
