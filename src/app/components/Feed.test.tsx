import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FeedPost } from "../../shared/types";
import { Feed } from "./Feed";

const post = (id: string): FeedPost => ({
  id,
  blogName: `blog-${id}`,
  postUrl: `https://blog.tumblr.com/post/${id}`,
  timestamp: 1_500_000_000,
  tags: [],
  reblogKey: "rk",
  liked: false,
  kind: "text",
  content: [{ type: "text", text: `post ${id}` }],
  trail: [],
});

const me = { userName: "u", blogs: [] };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Feed keyboard", () => {
  it("j で次のポストにフォーカスが移る", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ posts: [post("1"), post("2")] })),
    );
    Element.prototype.scrollIntoView = vi.fn();
    render(<Feed me={me} />);
    await screen.findByText("post 1");
    await userEvent.keyboard("j");
    const articles = screen.getAllByRole("article");
    expect(articles[1]).toHaveClass("focused");
  });

  it("? でヘルプオーバーレイが開く", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ posts: [post("1")] })),
    );
    render(<Feed me={me} />);
    await screen.findByText("post 1");
    await userEvent.keyboard("?");
    await waitFor(() => {
      expect(screen.getByText("Keyboard shortcuts")).toBeInTheDocument();
    });
  });
});

describe("Feed actions", () => {
  it("l で /api/like が呼ばれ liked が楽観更新される", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/feed"))
        return Response.json({ posts: [post("1")] });
      return Response.json({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Feed me={me} />);
    await screen.findByText("post 1");
    await userEvent.keyboard("l");
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([u]) => String(u).includes("/api/like")),
      ).toBe(true);
    });
    expect(screen.getByRole("button", { name: "like" })).toHaveTextContent("♥");
  });

  it("t で /api/reblog が呼ばれトーストが出る", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/feed"))
        return Response.json({ posts: [post("1")] });
      return Response.json({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <Feed
        me={{
          userName: "u",
          blogs: [{ name: "mainblog", title: "M", primary: true, uuid: "x" }],
        }}
      />,
    );
    await screen.findByText("post 1");
    await userEvent.keyboard("t");
    await waitFor(() => {
      expect(screen.getByText("Reblogged to mainblog")).toBeInTheDocument();
    });
  });
});
