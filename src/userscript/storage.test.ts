// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createStorage } from "./storage";

describe("createStorage (localStorage)", () => {
  beforeEach(() => localStorage.clear());

  it("put した値を get で読み戻せる", async () => {
    const s = createStorage();
    await s.putJSON("k", { a: 1 });
    expect(await s.getJSON<{ a: number }>("k")).toEqual({ a: 1 });
  });

  it("未設定キーは null", async () => {
    expect(await createStorage().getJSON("missing")).toBeNull();
  });

  it("TTL 経過後は null を返す", async () => {
    let t = 1000;
    const s = createStorage({ now: () => t });
    await s.putJSON("k", "v", 10); // expires at 1010s
    t = 1_000_000;
    expect(await s.getJSON("k")).toBeNull();
  });

  it("TTL 未指定なら永続(now を進めても残る)", async () => {
    let t = 1000;
    const s = createStorage({ now: () => t });
    await s.putJSON("k", "v");
    t = 1_000_000;
    expect(await s.getJSON("k")).toBe("v");
  });
});
