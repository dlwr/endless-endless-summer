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
