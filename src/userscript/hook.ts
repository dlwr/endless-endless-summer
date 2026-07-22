import type { createPager, DashboardBody } from "./timeline-page";

type HasHeaders = { headers?: { get?: (name: string) => string | null } };

// 送信リクエストから Authorization を取り出す。Request オブジェクト・
// init.headers(オブジェクト/Headers/配列)の双方に対応する。
export function extractAuth(
  input: unknown,
  init?: { headers?: unknown },
): string | null {
  const ih = (input as HasHeaders | null)?.headers;
  if (ih && typeof ih.get === "function") {
    const v = ih.get("Authorization");
    if (v) return v;
  }
  const h = new Headers((init?.headers as HeadersInit | undefined) ?? {});
  return h.get("Authorization");
}

export function isDashboardUrl(url: string): boolean {
  return url.includes("/api/v2/timeline/dashboard");
}

export type HookedFetch = (input: unknown, init?: unknown) => Promise<Response>;

export function installHook(deps: {
  win: { fetch: HookedFetch };
  getEnabled: () => boolean;
  buildElements: (
    original: unknown,
  ) => Promise<Record<string, unknown>[] | null>;
  onAuth: (token: string) => void;
  pager: ReturnType<typeof createPager>;
}): void {
  const orig = deps.win.fetch.bind(deps.win);
  deps.win.fetch = async (input: unknown, init?: unknown) => {
    const url =
      typeof input === "string"
        ? input
        : ((input as { url?: string })?.url ?? String(input));

    // 認証付き /api/v2/ リクエストのたびにトークン捕獲を更新(ローテーション対策)
    if (url.includes("/api/v2/")) {
      const token = extractAuth(input, init as { headers?: unknown });
      if (token) deps.onAuth(token);
    }

    const res = await orig(input, init);
    if (!deps.getEnabled() || !isDashboardUrl(url)) return res;

    try {
      const body = (await res.clone().json()) as DashboardBody;
      const elements = await deps.buildElements(body);
      if (!elements || elements.length === 0) return res;
      const paged = deps.pager.buildPage(body, elements);
      return new Response(JSON.stringify(paged), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (e) {
      console.warn("[ees] replace failed — passthrough:", e);
      return res;
    }
  };
}
