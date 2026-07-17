import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FeedPost, Me, PostKind } from "../../shared/types";
import { Feed } from "./Feed";

const post = (id: string, kind: PostKind = "text"): FeedPost => ({
  id,
  blogName: `blog-${id}`,
  postUrl: `https://blog.tumblr.com/post/${id}`,
  timestamp: 1_500_000_000,
  tags: [],
  reblogKey: "rk",
  liked: false,
  kind,
  content: [{ type: "text", text: `post ${id}` }],
  trail: [],
});

const me = { userName: "u", blogs: [] };

const meWithBlog: Me = {
  userName: "u",
  blogs: [{ name: "mainblog", title: "M", primary: true, uuid: "x" }],
};

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

  it("r でリロールすると楽観更新の残留が消える", async () => {
    let feedCallCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/feed")) {
        feedCallCount++;
        if (feedCallCount === 1) {
          return Response.json({ posts: [post("1")] });
        }
        return Response.json({ posts: [post("2")] });
      }
      return Response.json({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);
    Element.prototype.scrollIntoView = vi.fn();
    render(<Feed me={me} />);

    // Wait for post 1 to load
    await screen.findByText("post 1");

    // Like the post (button shows ♥)
    await userEvent.keyboard("l");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "like" })).toHaveTextContent(
        "♥",
      );
    });

    // Reroll
    await userEvent.keyboard("r");

    // Wait for post 2 to appear
    await screen.findByText("post 2");

    // Check that the like button shows ♡ (not ♥)
    expect(screen.getByRole("button", { name: "like" })).toHaveTextContent("♡");
  });
});

describe("Feed reblog dialog", () => {
  it("T(shift+t)でリブログダイアログが開く", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ posts: [post("1")] })),
    );
    render(<Feed me={meWithBlog} />);
    await screen.findByText("post 1");
    await userEvent.keyboard("T");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("ダイアログ表示中はフィードショートカットが無効になる", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ posts: [post("1"), post("2")] })),
    );
    Element.prototype.scrollIntoView = vi.fn();
    render(<Feed me={meWithBlog} />);
    await screen.findByText("post 1");
    await userEvent.keyboard("T");
    await screen.findByRole("dialog");
    await userEvent.keyboard("j");
    const articles = screen.getAllByRole("article");
    expect(articles[0]).toHaveClass("focused");
  });

  it("ダイアログ送信で /api/reblog が呼ばれ成功トーストが出る", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/feed"))
        return Response.json({ posts: [post("1")] });
      return Response.json({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Feed me={meWithBlog} />);
    await screen.findByText("post 1");
    await userEvent.keyboard("T");
    await screen.findByRole("dialog");
    await userEvent.click(screen.getByRole("button", { name: "Reblog" }));
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([u]) => String(u).includes("/api/reblog")),
      ).toBe(true);
    });
    expect(
      await screen.findByText("Reblogged to mainblog"),
    ).toBeInTheDocument();
  });

  it("Esc でダイアログが閉じフィードショートカットが復活する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ posts: [post("1"), post("2")] })),
    );
    Element.prototype.scrollIntoView = vi.fn();
    render(<Feed me={meWithBlog} />);
    await screen.findByText("post 1");
    await userEvent.keyboard("T");
    await screen.findByRole("dialog");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    await userEvent.keyboard("j");
    const articles = screen.getAllByRole("article");
    expect(articles[1]).toHaveClass("focused");
  });
});

describe("Feed settings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("歯車ボタンで SettingsPanel が開き kind のチェックを外すとそのタイプのポストが消える", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ posts: [post("1", "text"), post("2", "image")] }),
      ),
    );
    render(<Feed me={me} />);
    await screen.findByText("post 1");
    await screen.findByText("post 2");

    await userEvent.click(screen.getByRole("button", { name: "settings" }));
    const imageCheckbox = screen.getByRole("checkbox", { name: "image" });
    await userEvent.click(imageCheckbox);

    expect(screen.queryByText("post 2")).not.toBeInTheDocument();
    expect(screen.getByText("post 1")).toBeInTheDocument();
  });

  it("設定変更で focusedIndex が 0 にリセットされる", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          posts: [post("1"), post("2"), post("3")],
        }),
      ),
    );
    Element.prototype.scrollIntoView = vi.fn();
    render(<Feed me={me} />);
    await screen.findByText("post 1");
    await userEvent.keyboard("jj");
    expect(screen.getAllByRole("article")[2]).toHaveClass("focused");

    await userEvent.click(screen.getByRole("button", { name: "settings" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "video" }));

    const articles = screen.getAllByRole("article");
    expect(articles[0]).toHaveClass("focused");
    expect(articles[2]).not.toHaveClass("focused");
  });

  it("フィルタ変更中はリブログダイアログが閉じる", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          posts: [post("1", "text"), post("2", "image")],
        }),
      ),
    );
    render(<Feed me={meWithBlog} />);
    await screen.findByText("post 1");
    await screen.findByText("post 2");

    await userEvent.keyboard("T");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "settings" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "image" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
