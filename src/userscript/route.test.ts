import { describe, expect, it } from "vitest";
import { isDashboardPath, isFollowingPath } from "./route";

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

describe("isFollowingPath", () => {
  it("/following は true", () => {
    expect(isFollowingPath("/following")).toBe(true);
  });

  it("/dashboard/following は false", () => {
    expect(isFollowingPath("/dashboard/following")).toBe(false);
  });

  it("/followings のような前方一致だけのパスは false", () => {
    expect(isFollowingPath("/followings")).toBe(false);
  });
});
