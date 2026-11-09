import { resolveShortcut } from "./shortcuts";

const HIDE_CLASS = "ees-hide-cursor";

export function installCursorHide(): void {
  const root = document.documentElement;
  const style = document.createElement("style");
  style.textContent = `html.${HIDE_CLASS}, html.${HIDE_CLASS} * { cursor: none !important; }`;
  root.append(style);
  let lastX = -1;
  let lastY = -1;
  window.addEventListener(
    "keydown",
    (e) => {
      if (resolveShortcut(e)) root.classList.add(HIDE_CLASS);
    },
    true,
  );
  // スクロールするとブラウザが同じ座標で mousemove を合成するので、座標が変わったときだけ戻す
  window.addEventListener(
    "mousemove",
    (e) => {
      if (e.clientX !== lastX || e.clientY !== lastY) {
        root.classList.remove(HIDE_CLASS);
      }
      lastX = e.clientX;
      lastY = e.clientY;
    },
    true,
  );
}
