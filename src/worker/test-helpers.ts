export class FakeKV {
  store = new Map<string, string>();

  async get(key: string, type?: "json"): Promise<unknown> {
    const value = this.store.get(key) ?? null;
    if (value === null) return null;
    return type === "json" ? JSON.parse(value) : value;
  }

  async put(
    key: string,
    value: string,
    _opts?: { expirationTtl?: number },
  ): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

type RouteHandler =
  | ((req: Request) => Response | object | Promise<Response | object>)
  | (Response | object | Promise<Response | object>);

export function fakeFetch(routes: Record<string, RouteHandler>) {
  const calls: Request[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    calls.push(req.clone());
    const pathname = new URL(req.url).pathname;
    for (const [prefix, handler] of Object.entries(routes)) {
      if (pathname.startsWith(prefix)) {
        const out =
          typeof handler === "function" ? await handler(req) : handler;
        return out instanceof Response ? out : Response.json(out);
      }
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return Object.assign(fn, { calls });
}
