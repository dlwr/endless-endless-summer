// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { extractAuth, isDashboardUrl } from "./hook";

describe("extractAuth", () => {
  it("init.headers の Authorization を返す", () => {
    expect(
      extractAuth("/api/v2/x", { headers: { Authorization: "Bearer z" } }),
    ).toBe("Bearer z");
  });

  it("Request オブジェクトのヘッダーからも取れる", () => {
    const req = new Request("https://www.tumblr.com/api/v2/x", {
      headers: { Authorization: "Bearer q" },
    });
    expect(extractAuth(req)).toBe("Bearer q");
  });

  it("Authorization が無ければ null", () => {
    expect(extractAuth("/api/v2/x", {})).toBeNull();
  });
});

describe("isDashboardUrl", () => {
  it("dashboard タイムラインを判定する", () => {
    expect(
      isDashboardUrl("https://www.tumblr.com/api/v2/timeline/dashboard?x=1"),
    ).toBe(true);
    expect(isDashboardUrl("https://www.tumblr.com/api/v2/user/following")).toBe(
      false,
    );
  });
});
