// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createFillMode } from "./fill-mode";

const applied = () => document.documentElement.classList.contains("ees-fill");

describe("createFillMode", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    history.replaceState(null, "", "/dashboard");
  });

  it("既定では無効", () => {
    createFillMode();
    expect(applied()).toBe(false);
  });

  it("toggle で有効になる", () => {
    createFillMode().toggle();
    expect(applied()).toBe(true);
  });

  it("もう一度 toggle すると無効に戻る", () => {
    const mode = createFillMode();
    mode.toggle();
    mode.toggle();
    expect(applied()).toBe(false);
  });

  it("有効状態はリロード後も維持される", () => {
    createFillMode().toggle();
    document.documentElement.className = "";
    createFillMode();
    expect(applied()).toBe(true);
  });

  it("ダッシュボード以外へ移動すると外れる", () => {
    createFillMode().toggle();
    history.pushState(null, "", "/following");
    expect(applied()).toBe(false);
  });

  it("ダッシュボードへ戻ると再び効く", () => {
    createFillMode().toggle();
    history.pushState(null, "", "/following");
    history.pushState(null, "", "/dashboard");
    expect(applied()).toBe(true);
  });

  it("ダッシュボード以外で有効にしても効かない", () => {
    history.replaceState(null, "", "/following");
    createFillMode().toggle();
    expect(applied()).toBe(false);
  });
});
