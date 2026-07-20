export type Tokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};
export type Creds = { clientId: string; clientSecret: string };
export type FollowingBlog = { name: string };
export type UserInfo = {
  name: string;
  blogs: { name: string; title: string; primary: boolean; uuid: string }[];
};
export type RawPost = Record<string, unknown>;

// Tumblr が 429 を返したときに投げる専用エラー。呼び出し側がこれを instanceof で
// 判別して backoff (RateLimitGuard.trip) に繋げられるよう status を公開する。
export class TumblrRateLimitError extends Error {
  readonly status = 429;

  constructor(message = "tumblr rate limited") {
    super(message);
    this.name = "TumblrRateLimitError";
  }
}

const API = "https://api.tumblr.com/v2";

// Workers の fetch は this がグローバル以外だと Illegal invocation になるためラップする
const globalFetch: typeof fetch = (input, init) => fetch(input, init);
const TOKEN_URL = `${API}/oauth2/token`;

type TokenBody = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

async function requestTokens(
  params: Record<string, string>,
  fetchFn: typeof fetch,
): Promise<Tokens> {
  const res = await fetchFn(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  if (!res.ok) throw new Error(`token request failed: ${res.status}`);
  const body = (await res.json()) as TokenBody;
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: Math.floor(Date.now() / 1000) + body.expires_in,
  };
}

export function exchangeCode(
  creds: Creds,
  code: string,
  redirectUri: string,
  fetchFn: typeof fetch = globalFetch,
): Promise<Tokens> {
  return requestTokens(
    {
      grant_type: "authorization_code",
      code,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      redirect_uri: redirectUri,
    },
    fetchFn,
  );
}

export function refreshTokens(
  creds: Creds,
  refreshToken: string,
  fetchFn: typeof fetch = globalFetch,
): Promise<Tokens> {
  return requestTokens(
    {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
    },
    fetchFn,
  );
}

export class TumblrClient {
  constructor(
    private tokens: Tokens,
    private creds: Creds,
    private onTokens: (tokens: Tokens) => Promise<void>,
    private fetchFn: typeof fetch = globalFetch,
    private nowFn: () => number = () => Math.floor(Date.now() / 1000),
    private onResponse?: (res: Response) => void | Promise<void>,
  ) {}

  private async ensureFresh(): Promise<void> {
    if (this.tokens.expiresAt - 60 > this.nowFn()) return;
    this.tokens = await refreshTokens(
      this.creds,
      this.tokens.refreshToken,
      this.fetchFn,
    );
    await this.onTokens(this.tokens);
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    await this.ensureFresh();
    const res = await this.fetchFn(`${API}${path}`, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${this.tokens.accessToken}`,
      },
    });
    await this.onResponse?.(res);
    if (res.status === 429) {
      throw new TumblrRateLimitError();
    }
    if (!res.ok) {
      throw new Error(`tumblr api error: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as { response: T };
    return body.response;
  }

  private postForm(
    path: string,
    params: Record<string, string>,
  ): Promise<unknown> {
    return this.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
    });
  }

  async userInfo(): Promise<UserInfo> {
    const { user } = await this.request<{ user: UserInfo }>("/user/info");
    return user;
  }

  async following(): Promise<FollowingBlog[]> {
    const limit = 20;
    const maxPages = 50;

    const first = await this.request<{
      total_blogs: number;
      blogs: FollowingBlog[];
    }>(`/user/following?limit=${limit}&offset=0`);

    const pages: FollowingBlog[][] = [first.blogs];
    const remaining = first.total_blogs - first.blogs.length;
    // 1ページ目が空ならそれ以上ページが無いとみなし、以降は取得しない
    // (元の逐次実装の「空ページで打ち切る」耐性を踏襲)。
    if (first.blogs.length > 0 && remaining > 0) {
      const additionalPages = Math.min(
        Math.ceil(remaining / limit),
        maxPages - 1,
      );
      const rest = await Promise.all(
        Array.from({ length: additionalPages }, (_, i) => {
          const page = i + 1;
          return this.request<{
            total_blogs: number;
            blogs: FollowingBlog[];
          }>(`/user/following?limit=${limit}&offset=${page * limit}`);
        }),
      );
      for (const res of rest) pages.push(res.blogs);
    }

    return pages.flat();
  }

  async posts(
    blogName: string,
    before: number,
    limit: number,
  ): Promise<RawPost[]> {
    const res = await this.request<{ posts: RawPost[] }>(
      `/blog/${encodeURIComponent(blogName)}/posts?npf=true&limit=${limit}&before=${before}`,
    );
    return res.posts;
  }

  async like(id: string, reblogKey: string): Promise<void> {
    await this.postForm("/user/like", { id, reblog_key: reblogKey });
  }

  async unlike(id: string, reblogKey: string): Promise<void> {
    await this.postForm("/user/unlike", { id, reblog_key: reblogKey });
  }

  async reblog(
    blogName: string,
    input: { id: string; reblogKey: string; comment?: string; tags?: string },
  ): Promise<void> {
    await this.postForm(`/blog/${encodeURIComponent(blogName)}/post/reblog`, {
      id: input.id,
      reblog_key: input.reblogKey,
      ...(input.comment ? { comment: input.comment } : {}),
      ...(input.tags ? { tags: input.tags } : {}),
    });
  }
}
