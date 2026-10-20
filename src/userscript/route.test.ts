import { describe, expect, it } from "vitest";
import { isDashboardPath } from "./route";

describe("isDashboardPath", () => {
  it("/dashboard は true", () => {
    expect(isDashboardPath("/dashboard")).toBe(true);
  });

  it("/dashboard/following は true", () => {
    expect(isDashboardPath("/dashboard/following")).toBe(true);
  });

  it("ブログページは false", () => {
    expect(isDashboardPath("/seiichirou")).toBe(false);
  });

  it("/dashboards のような前方一致だけのパスは false", () => {
    expect(isDashboardPath("/dashboards")).toBe(false);
  });
});
