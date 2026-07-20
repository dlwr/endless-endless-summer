import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { takeFeedPrefetch } from "./feedPrefetch";

afterEach(() => {
  cleanup();
  // 未消費のまま残った prefetch が他のテストへ漏れないようにする。
  takeFeedPrefetch()?.catch(() => {});
  vi.unstubAllGlobals();
  window.history.pushState({}, "", "/");
});

function stubFetch(handler: (url: string) => Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => handler(String(input))),
  );
}

describe("App", () => {
  it("未ログインならログインボタンを表示する", async () => {
    stubFetch((url) =>
      url.includes("/api/me")
        ? new Response("{}", { status: 401 })
        : Response.json({ posts: [] }),
    );
    render(<App />);
    expect(await screen.findByText("Log in with Tumblr")).toBeInTheDocument();
  });

  it("ログイン済みならフィード画面を表示する", async () => {
    stubFetch((url) =>
      url.includes("/api/me")
        ? Response.json({ userName: "u", blogs: [] })
        : Response.json({ posts: [] }),
    );
    render(<App />);
    expect(await screen.findByTestId("feed")).toBeInTheDocument();
  });

  it("/about では未ログインでも AboutPage を表示する", async () => {
    stubFetch((url) =>
      url.includes("/api/me")
        ? new Response("{}", { status: 401 })
        : Response.json({ posts: [] }),
    );
    window.history.pushState({}, "", "/about");
    render(<App />);
    expect(
      await screen.findByRole("heading", {
        name: "endless endless summer — Terms & Privacy",
      }),
    ).toBeInTheDocument();
  });
});

describe("App feed prefetch", () => {
  it("マウント時に /api/me の応答を待たず /api/feed の先読みを開始する", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        if (url.includes("/api/me")) {
          await new Promise((resolve) => setTimeout(resolve, 20));
          return Response.json({ userName: "u", blogs: [] });
        }
        return Response.json({ posts: [] });
      }),
    );
    render(<App />);
    // /api/me がまだ解決していない(20ms 未満)うちに /api/feed も
    // 発火していることを確認する = 直列(fetchMe 完了後に Feed マウント→
    // loadMore)ではなく、マウント時点で並行に先読みが始まっている。
    await act(async () => {
      await Promise.resolve();
    });
    expect(calls.some((u) => u.includes("/api/feed"))).toBe(true);
  });

  it("/about パスでは /api/feed の先読みを開始しない", async () => {
    const calls: string[] = [];
    stubFetch((url) => {
      calls.push(url);
      return url.includes("/api/me")
        ? new Response("{}", { status: 401 })
        : Response.json({ posts: [] });
    });
    window.history.pushState({}, "", "/about");
    render(<App />);
    await screen.findByRole("heading", {
      name: "endless endless summer — Terms & Privacy",
    });
    expect(calls.some((u) => u.includes("/api/feed"))).toBe(false);
  });
});
