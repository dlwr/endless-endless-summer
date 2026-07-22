import { describe, expect, it } from "vitest";
import { createPager, type DashboardBody } from "./timeline-page";

const body = (): DashboardBody => ({
  response: {
    timeline: {
      elements: [{ objectType: "post", id: "orig" }],
      _links: { next: { href: "/x" } },
    },
  },
});

const ids = (b: DashboardBody) =>
  b.response.timeline.elements.map((e) => (e as { id: string }).id);
const positions = (b: DashboardBody) =>
  b.response.timeline.elements.map(
    (e) => (e as { streamGlobalPosition: number }).streamGlobalPosition,
  );

describe("createPager", () => {
  it("elements を渡した要素で置換する", () => {
    const pager = createPager();
    const out = pager.buildPage(body(), [{ id: "a" }, { id: "b" }]);
    expect(ids(out)).toEqual(["a", "b"]);
  });

  it("streamGlobalPosition をページ跨ぎで単調増加させる", () => {
    const pager = createPager();
    const p1 = pager.buildPage(body(), [{ id: "a" }, { id: "b" }]);
    const p2 = pager.buildPage(body(), [{ id: "c" }]);
    expect([...positions(p1), ...positions(p2)]).toEqual([0, 1, 2]);
  });

  it("_links.next を温存してスクロール継続を保証する", () => {
    const pager = createPager();
    const out = pager.buildPage(body(), [{ id: "a" }]);
    expect(out.response.timeline._links).toBeTruthy();
  });

  it("元 body を破壊的変更しない", () => {
    const pager = createPager();
    const src = body();
    pager.buildPage(src, [{ id: "a" }]);
    expect((src.response.timeline.elements[0] as { id: string }).id).toBe(
      "orig",
    );
  });
});
