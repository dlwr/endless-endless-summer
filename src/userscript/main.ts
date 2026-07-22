import { sampleFeed } from "../core/feed-sampling";
import { deepCamel } from "../core/transform";
import { type HookedFetch, installHook } from "./hook";
import { createInternalClient, type FetchLike } from "./internal-client";
import { createStorage } from "./storage";
import { createPager } from "./timeline-page";

declare const GM_registerMenuCommand:
  | ((label: string, fn: () => void) => void)
  | undefined;

(() => {
  const w = window as unknown as { fetch: HookedFetch };
  // フック設置前の生 fetch を確保(donor 取得はこれを使い、再介入を避ける)
  const origFetch = w.fetch.bind(w);
  const clientFetch: FetchLike = (url, init) =>
    origFetch(url, init) as unknown as ReturnType<FetchLike>;

  let token: string | null = null;
  let enabled = true; // 既定 ON。トグルで反転
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

  GM_registerMenuCommand?.("endless-endless-summer: toggle", () => {
    enabled = !enabled;
    console.log("[ees] enabled:", enabled);
  });
  console.log("[ees] installed at document_start");
})();
