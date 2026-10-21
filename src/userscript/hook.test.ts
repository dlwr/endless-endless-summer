// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { type HookedFetch, installHook, isDashboardUrl } from "./hook";
import { createPager } from "./timeline-page";

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

const DASHBOARD = "https://www.tumblr.com/api/v2/timeline/dashboard";
const originalBody = { response: { timeline: { elements: [{ id: "orig" }] } } };

function setup(buildElements: () => Promise<Record<string, unknown>[] | null>) {
  const win: { fetch: HookedFetch } = {
    fetch: async () => new Response(JSON.stringify(originalBody)),
  };
  installHook({
    win,
    getEnabled: () => true,
    buildElements,
    pager: createPager(),
    timeoutMs: 1000,
  });
  return win;
}

describe("installHook", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("buildElements が timeoutMs 内に終わらなければ元のレスポンスを返す", async () => {
    vi.useFakeTimers();
    const win = setup(() => new Promise(() => {}));
    const pending = win.fetch(DASHBOARD);
    await vi.advanceTimersByTimeAsync(1000);
    const body = await (await pending).json();
    expect(body).toEqual(originalBody);
  });

  it("buildElements の結果でタイムラインを置き換える", async () => {
    const win = setup(async () => [{ id: "sampled" }]);
    const body = await (await win.fetch(DASHBOARD)).json();
    expect(body.response.timeline.elements[0].id).toBe("sampled");
  });

  it("buildElements が null なら元のレスポンスを返す", async () => {
    const win = setup(async () => null);
    const body = await (await win.fetch(DASHBOARD)).json();
    expect(body).toEqual(originalBody);
  });
});
