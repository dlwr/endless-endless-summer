import { describe, expect, it } from "vitest";
import { safeUrl } from "./safe-url";

describe("safeUrl", () => {
  it("https URL はそのまま通す", () => {
    expect(safeUrl("https://example.com")).toBe("https://example.com");
  });

  it("http URL はそのまま通す", () => {
    expect(safeUrl("http://example.com")).toBe("http://example.com");
  });

  it("javascript: URL は null になる", () => {
    expect(safeUrl("javascript:alert(1)")).toBeNull();
  });

  it("data: URL は null になる", () => {
    expect(safeUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
  });

  it("相対URLや不正な文字列は null になる", () => {
    expect(safeUrl("/relative/path")).toBeNull();
    expect(safeUrl("not a url")).toBeNull();
  });

  it("undefined は null になる", () => {
    expect(safeUrl(undefined)).toBeNull();
  });
});
