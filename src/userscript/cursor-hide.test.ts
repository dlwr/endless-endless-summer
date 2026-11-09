// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { installCursorHide } from "./cursor-hide";

const hidden = () =>
  document.documentElement.classList.contains("ees-hide-cursor");
const press = (key: string, init: KeyboardEventInit = {}) =>
  window.dispatchEvent(new KeyboardEvent("keydown", { key, ...init }));
const move = (clientX: number, clientY: number) =>
  window.dispatchEvent(new MouseEvent("mousemove", { clientX, clientY }));

describe("installCursorHide", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    installCursorHide();
    move(10, 10);
  });

  it("J を押すとポインターを隠す", () => {
    press("j");
    expect(hidden()).toBe(true);
  });

  it("ショートカット以外のキーでは隠さない", () => {
    press("x");
    expect(hidden()).toBe(false);
  });

  it("修飾キー付きでは隠さない", () => {
    press("j", { metaKey: true });
    expect(hidden()).toBe(false);
  });

  it("マウスを動かすと再表示する", () => {
    press("j");
    move(11, 10);
    expect(hidden()).toBe(false);
  });

  it("スクロールで発火する同座標の mousemove では再表示しない", () => {
    press("j");
    move(10, 10);
    expect(hidden()).toBe(true);
  });
});
