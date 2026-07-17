import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import type { AppEnv } from "./env";
import type { Tokens } from "./tumblr";

export type SessionBlog = {
  name: string;
  title: string;
  primary: boolean;
  uuid: string;
};
export type Session = {
  tokens: Tokens;
  userName: string;
  blogs: SessionBlog[];
};

const SESSION_TTL = 60 * 60 * 24 * 30;

export class SessionStore {
  constructor(private kv: KVNamespace) {}

  private key(sid: string): string {
    return `session:${sid}`;
  }

  async create(session: Session): Promise<string> {
    const sid = crypto.randomUUID();
    await this.update(sid, session);
    return sid;
  }

  async get(sid: string): Promise<Session | null> {
    return (await this.kv.get(this.key(sid), "json")) as Session | null;
  }

  async update(sid: string, session: Session): Promise<void> {
    await this.kv.put(this.key(sid), JSON.stringify(session), {
      expirationTtl: SESSION_TTL,
    });
  }

  async delete(sid: string): Promise<void> {
    await this.kv.delete(this.key(sid));
  }
}

export function requireSession(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const sid = getCookie(c, "sid");
    if (!sid) return c.json({ error: "unauthorized" }, 401);
    const session = await new SessionStore(c.env.KV).get(sid);
    if (!session) return c.json({ error: "unauthorized" }, 401);
    c.set("session", session);
    c.set("sid", sid);
    await next();
  };
}
