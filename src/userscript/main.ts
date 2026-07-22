import { sampleFeed } from "../core/feed-sampling";
import { deepCamel } from "../core/transform";
import { type HookedFetch, installHook } from "./hook";
import { createInternalClient, type FetchLike } from "./internal-client";
import { createStorage } from "./storage";
import { createPager } from "./timeline-page";

const ENABLED_KEY = "ees:enabled";

// @grant none で動かすためページコンテキスト。GM API は使わず、トグルは
// ページ内のフローティングボタン + localStorage 永続化で実現する。
function installToggleButton(
  getEnabled: () => boolean,
  setEnabled: (v: boolean) => void,
): void {
  const btn = document.createElement("button");
  // キーボードフォーカスを一切奪わない。フォーカスがボタンに移ると Tumblr の
  // ショートカット(J/K/T/L)が「操作要素にフォーカス中」と見なされ無効化される。
  btn.tabIndex = -1;
  btn.style.cssText =
    "position:fixed;bottom:12px;right:12px;z-index:99999;padding:6px 10px;" +
    "background:#001935;color:#fff;border:1px solid #35465c;border-radius:6px;" +
    "font:12px/1 system-ui,sans-serif;cursor:pointer;opacity:0.85;";
  const render = () => {
    btn.textContent = getEnabled() ? "∞ summer: on" : "∞ summer: off";
  };
  // mousedown の既定動作(フォーカス移動)を止める + 念のため blur
  btn.addEventListener("mousedown", (e) => e.preventDefault());
  btn.addEventListener("click", () => {
    setEnabled(!getEnabled());
    render();
    btn.blur();
  });
  render();
  const mount = () => {
    if (document.body) document.body.appendChild(btn);
    else requestAnimationFrame(mount);
  };
  mount();
}

(() => {
  const w = window as unknown as { fetch: HookedFetch };
  // フック設置前の生 fetch を確保(donor 取得はこれを使い、再介入を避ける)
  const origFetch = w.fetch.bind(w);
  const clientFetch: FetchLike = (url, init) =>
    origFetch(url, init) as unknown as ReturnType<FetchLike>;

  let token: string | null = null;
  let enabled = localStorage.getItem(ENABLED_KEY) !== "0"; // 既定 ON
  const storage = createStorage();
  const pager = createPager();
  const client = createInternalClient({
    getAuth: () => token,
    fetchFn: clientFetch,
  });

  const buildElements = async (): Promise<Record<string, unknown>[] | null> => {
    const raw = await sampleFeed({
      client,
      storage,
      userName: "me",
      rng: Math.random,
      now: Math.floor(Date.now() / 1000),
      samplesPerBatch: 6,
      postsPerSample: 3,
      followingTtl: 3600,
    });
    if (raw.length === 0) return null;
    return raw.map((p) => deepCamel<Record<string, unknown>>(p));
  };

  installHook({
    win: w,
    getEnabled: () => enabled,
    buildElements,
    onAuth: (t) => {
      token = t;
    },
    pager,
  });

  installToggleButton(
    () => enabled,
    (v) => {
      enabled = v;
      localStorage.setItem(ENABLED_KEY, v ? "1" : "0");
      console.log("[ees] enabled:", v);
    },
  );

  console.log("[ees] installed at document_start");
})();
