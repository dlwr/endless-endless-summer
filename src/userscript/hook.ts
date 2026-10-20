import type { createPager, DashboardBody } from "./timeline-page";

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
  pager: ReturnType<typeof createPager>;
  timeoutMs: number;
}): void {
  const orig = deps.win.fetch.bind(deps.win);
  deps.win.fetch = async (input: unknown, init?: unknown) => {
    const url =
      typeof input === "string"
        ? input
        : ((input as { url?: string })?.url ?? String(input));

    const res = await orig(input, init);
    if (!deps.getEnabled() || !isDashboardUrl(url)) return res;

    try {
      const body = (await res.clone().json()) as DashboardBody;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), deps.timeoutMs);
      });
      const elements = await Promise.race([
        deps.buildElements(body),
        timeout,
      ]).finally(() => clearTimeout(timer));
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
