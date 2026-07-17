import { describe, expect, it } from "vitest";
import { applyFormatting } from "./format";

describe("applyFormatting", () => {
  it("フォーマット無しなら 1 セグメント", () => {
    expect(applyFormatting("hello")).toEqual([
      { text: "hello", bold: false, italic: false, href: null },
    ]);
  });

  it("bold 範囲が分割される", () => {
    const segments = applyFormatting("hello world", [
      { start: 0, end: 5, type: "bold" },
    ]);
    expect(segments).toEqual([
      { text: "hello", bold: true, italic: false, href: null },
      { text: " world", bold: false, italic: false, href: null },
    ]);
  });

  it("重なった bold と link が両方反映される", () => {
    const segments = applyFormatting("abcd", [
      { start: 0, end: 4, type: "bold" },
      { start: 2, end: 4, type: "link", url: "https://x" },
    ]);
    expect(segments).toEqual([
      { text: "ab", bold: true, italic: false, href: null },
      { text: "cd", bold: true, italic: false, href: "https://x" },
    ]);
  });
});
