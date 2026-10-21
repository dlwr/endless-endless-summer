import { sampleFeed } from "../core/feed-sampling";
import { openCuration } from "./curation-ui";
import { type HookedFetch, installHook } from "./hook";
import { isDashboardPath, isFollowingPath, onRouteChange } from "./route";
import { createStorage } from "./storage";
import { createPager } from "./timeline-page";
import { createFeedClient, createTumblrApi, findApiFetch } from "./tumblr-api";

const ENABLED_KEY = "ees:enabled";

// @grant none で動かすためページコンテキスト。GM API は使わず、トグルは
// ページ内のフローティングボタン + localStorage 永続化で実現する。
function createFloatingButton(isVisible: (pathname: string) => boolean) {
  const btn = document.createElement("button");
  // キーボードフォーカスを一切奪わない。フォーカスがボタンに移ると Tumblr の
  // ショートカット(J/K/T/L)が「操作要素にフォーカス中」と見なされ無効化される。
  btn.tabIndex = -1;
  btn.style.cssText =
    "position:fixed;bottom:12px;right:12px;z-index:99999;padding:6px 10px;" +
    "background:#001935;color:#fff;border:1px solid #35465c;border-radius:6px;" +
    "font:12px/1 system-ui,sans-serif;cursor:pointer;opacity:0.85;";
  btn.addEventListener("mousedown", (e) => e.preventDefault());
  const sync = () => {
    btn.style.display = isVisible(location.pathname) ? "" : "none";
  };
  const mount = () => {
    if (document.body) document.body.appendChild(btn);
    else requestAnimationFrame(mount);
  };
  sync();
  onRouteChange(sync);
  mount();
  return btn;
}

function installCurationButton(
  storage: ReturnType<typeof createStorage>,
): void {
  const btn = createFloatingButton(isFollowingPath);
  btn.textContent = "フォロー整理";
  btn.addEventListener("click", () => {
    btn.blur();
    const apiFetch = findApiFetch(window);
    if (!apiFetch) {
      console.warn("[ees] window.tumblr.apiFetch is unavailable");
      return;
    }
    openCuration({
      api: createTumblrApi({
        apiFetch,
        now: () => Math.floor(Date.now() / 1000),
      }),
      storage,
      now: () => Math.floor(Date.now() / 1000),
      confirm: (m) => window.confirm(m),
    });
  });
}

function installToggleButton(
  getEnabled: () => boolean,
  setEnabled: (v: boolean) => void,
): void {
  const btn = createFloatingButton(isDashboardPath);
  const render = () => {
    btn.textContent = getEnabled() ? "∞ summer: on" : "∞ summer: off";
  };
  btn.addEventListener("click", () => {
    setEnabled(!getEnabled());
    render();
    btn.blur();
  });
  render();
}

(() => {
  const w = window as unknown as { fetch: HookedFetch };
  let enabled = localStorage.getItem(ENABLED_KEY) !== "0"; // 既定 ON
  const storage = createStorage();
  const pager = createPager();
  const seen = new Set<string>();

  const buildElements = async (): Promise<Record<string, unknown>[] | null> => {
    const apiFetch = findApiFetch(window);
    if (!apiFetch) return null;
    const posts = await sampleFeed({
      client: createFeedClient(
        createTumblrApi({ apiFetch, now: () => Math.floor(Date.now() / 1000) }),
      ),
      storage,
      userName: "me",
      rng: Math.random,
      now: Math.floor(Date.now() / 1000),
      samplesPerBatch: 6,
      postsPerSample: 3,
      followingTtl: 86_400,
      seen,
      minPosts: 6,
      maxRounds: 3,
    });
    return posts.length === 0 ? null : posts;
  };

  installHook({
    win: w,
    getEnabled: () => enabled,
    buildElements,
    pager,
    timeoutMs: 15_000,
  });

  installToggleButton(
    () => enabled,
    (v) => {
      enabled = v;
      localStorage.setItem(ENABLED_KEY, v ? "1" : "0");
      console.log("[ees] enabled:", v);
    },
  );

  installCurationButton(storage);

  console.log("[ees] installed at document_start");
})();
