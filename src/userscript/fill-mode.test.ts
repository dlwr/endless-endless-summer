// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

describe("L キーでのフッター表示", () => {
  const pressKey = (init: KeyboardEventInit) =>
    window.dispatchEvent(new KeyboardEvent("keydown", init));
  const revealed = (article: Element) =>
    article.hasAttribute("data-ees-reveal");

  const focusedArticle = () => {
    const item = document.createElement("div");
    item.tabIndex = -1;
    const article = document.createElement("article");
    item.append(article);
    document.body.append(item);
    item.focus();
    return article;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
    createFillMode();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("現在の投稿のフッターを出す", () => {
    const article = focusedArticle();
    pressKey({ key: "l" });
    expect(revealed(article)).toBe(true);
  });

  it("時間が経つと隠す", () => {
    const article = focusedArticle();
    pressKey({ key: "l" });
    vi.advanceTimersByTime(1500);
    expect(revealed(article)).toBe(false);
  });

  it("修飾キー付きでは出さない", () => {
    const article = focusedArticle();
    pressKey({ key: "l", metaKey: true });
    expect(revealed(article)).toBe(false);
  });

  it("他のキーでは出さない", () => {
    const article = focusedArticle();
    pressKey({ key: "j" });
    expect(revealed(article)).toBe(false);
  });

  it("投稿にフォーカスがなければ何もしない", () => {
    const article = document.createElement("article");
    document.body.append(article);
    pressKey({ key: "l" });
    expect(revealed(article)).toBe(false);
  });
});
