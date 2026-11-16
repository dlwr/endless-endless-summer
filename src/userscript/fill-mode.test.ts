// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFillMode,
  FILL_IMAGE,
  FILL_STRETCH,
  LONG_BODY,
} from "./fill-mode";

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

describe("F キーでの切り替え", () => {
  const pressKey = (init: KeyboardEventInit, target: EventTarget = window) =>
    target.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, ...init }),
    );

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    document.body.innerHTML = "";
    history.replaceState(null, "", "/dashboard");
  });

  it("F で有効になる", () => {
    createFillMode();
    pressKey({ key: "f" });
    expect(applied()).toBe(true);
  });

  it("もう一度押すと無効に戻る", () => {
    createFillMode();
    pressKey({ key: "f" });
    pressKey({ key: "f" });
    expect(applied()).toBe(false);
  });

  it("切り替え後の状態を onChange に渡す", () => {
    const onChange = vi.fn();
    createFillMode(onChange);
    pressKey({ key: "f" });
    expect(onChange).toHaveBeenLastCalledWith(true);
  });

  it("修飾キー付きでは切り替えない", () => {
    createFillMode();
    pressKey({ key: "f", metaKey: true });
    expect(applied()).toBe(false);
  });

  it("押しっぱなしのリピートでは切り替えない", () => {
    createFillMode();
    pressKey({ key: "f", repeat: true });
    expect(applied()).toBe(false);
  });

  it.each([
    ["input", "<input>"],
    ["textarea", "<textarea></textarea>"],
    ["contenteditable", "<div contenteditable></div>"],
  ])("%s への入力中は切り替えない", (_name, html) => {
    createFillMode();
    document.body.innerHTML = html;
    pressKey({ key: "f" }, document.body.firstElementChild as Element);
    expect(applied()).toBe(false);
  });

  it("ダッシュボード以外では切り替えない", () => {
    history.replaceState(null, "", "/following");
    createFillMode();
    pressKey({ key: "f" });
    history.pushState(null, "", "/dashboard");
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

describe("画面に収まらない投稿の印付け", () => {
  const post = (height: number, html = "<header></header><div></div>") => {
    const article = document.createElement("article");
    article.innerHTML = `<div>${html}</div>`;
    Object.defineProperty(article, "offsetHeight", { value: height });
    document.body.append(article);
    return article;
  };
  const scroll = () => window.dispatchEvent(new Event("scroll"));
  const long = (article: Element) => article.hasAttribute("data-ees-long");

  beforeEach(() => {
    document.body.innerHTML = "";
    createFillMode();
  });

  it("画面より高い投稿に印を付ける", () => {
    const article = post(window.innerHeight + 1);
    scroll();
    expect(long(article)).toBe(true);
  });

  it("画面に収まる投稿には付けない", () => {
    const article = post(window.innerHeight);
    scroll();
    expect(long(article)).toBe(false);
  });

  it("画像投稿には付けない", () => {
    const article = post(
      window.innerHeight + 1,
      "<header></header><div><figure><button><img></button></figure></div>",
    );
    scroll();
    expect(long(article)).toBe(false);
  });

  it("ライトボックスのない小さい画像の投稿にも付けない", () => {
    const article = post(
      window.innerHeight + 1,
      "<header></header><div><figure><div><img></div></figure></div>",
    );
    scroll();
    expect(long(article)).toBe(false);
  });
});

describe("最大化する画像のセレクタ", () => {
  const images = (html: string) => {
    document.documentElement.className = "ees-fill";
    document.body.innerHTML = `<article>${html}</article>`;
    return [...document.querySelectorAll(FILL_IMAGE)].map((el) => el.id);
  };

  it("ライトボックスで開ける画像に当たる", () => {
    expect(
      images(
        "<div><figure id=big><button><span><div><img></div></span></button></figure></div>",
      ),
    ).toEqual(["big"]);
  });

  it("ライトボックスのない小さい画像に当たる", () => {
    expect(
      images("<div><figure id=small><div><img></div></figure></div>"),
    ).toEqual(["small"]);
  });

  it("大きい画像と小さい画像が混ざった投稿では両方に当たる", () => {
    expect(
      images(
        "<div><figure id=big><button><img></button></figure></div><div><figure id=small><div><img></div></figure></div>",
      ),
    ).toEqual(["big", "small"]);
  });

  it("アバターには当たらない", () => {
    expect(
      images(
        "<div><figure id=avatar><div><span><a><img></a></span></div></figure></div><div><figure id=big><button><img></button></figure></div>",
      ),
    ).toEqual(["big"]);
  });
});

describe("画像と一緒に引き伸ばす要素のセレクタ", () => {
  const stretched = (html: string) => {
    document.documentElement.className = "ees-fill";
    document.body.innerHTML = `<article><div>${html}</div></article>`;
    return [...document.querySelectorAll(FILL_STRETCH)].map((el) => el.id);
  };

  it("画像とその祖先に当たる", () => {
    expect(
      stretched(
        "<figure><button id=open><span id=wrap><img id=img></span></button></figure>",
      ),
    ).toEqual(["open", "wrap", "img"]);
  });

  it("ALT ボタンには当たらない", () => {
    expect(
      stretched(
        "<figure><button id=open><img id=img></button><button id=alt>ALT</button></figure>",
      ),
    ).toEqual(["open", "img"]);
  });
});

describe("段組みする本文のセレクタ", () => {
  const body = (html: string) => {
    document.documentElement.className = "ees-fill";
    document.body.innerHTML = `<article data-ees-long>${html}</article>`;
    return [...document.querySelectorAll(LONG_BODY)].map((el) => el.id);
  };

  it("オリジナル投稿の本文に当たる", () => {
    expect(
      body(
        "<div><header></header><div id=body></div><div><footer></footer></div></div><div></div>",
      ),
    ).toEqual(["body"]);
  });

  it("リブログ投稿の本文に当たる", () => {
    expect(
      body(
        "<header></header><div><div id=body></div><div><footer></footer></div></div><div></div>",
      ),
    ).toEqual(["body"]);
  });
});
