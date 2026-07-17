import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { FeedPost } from "../../shared/types";
import { PostCard } from "./PostCard";

const basePost: FeedPost = {
  id: "1",
  blogName: "reblogger",
  postUrl: "https://reblogger.tumblr.com/post/1",
  timestamp: 1_183_000_000,
  tags: ["summer", "2007"],
  reblogKey: "rk",
  liked: false,
  kind: "text",
  content: [{ type: "text", text: "my comment" }],
  trail: [
    { blogName: "origin", content: [{ type: "text", text: "original text" }] },
  ],
};

const noop = () => {};

function renderCard(post: FeedPost, focused = false) {
  return render(
    <PostCard
      post={post}
      focused={focused}
      onLike={noop}
      onReblog={noop}
      onReblogDialog={noop}
    />,
  );
}

afterEach(() => {
  cleanup();
});

describe("PostCard", () => {
  it("ブログ名を表示する", () => {
    renderCard(basePost);
    expect(screen.getByText("reblogger")).toBeInTheDocument();
  });

  it("trail の元ポストが先に表示される", () => {
    renderCard(basePost);
    expect(screen.getByText("original text")).toBeInTheDocument();
  });

  it("タグが # 付きで表示される", () => {
    renderCard(basePost);
    expect(screen.getByText("#summer")).toBeInTheDocument();
  });

  it("focused のときは focused クラスが付く", () => {
    renderCard(basePost, true);
    expect(screen.getByRole("article")).toHaveClass("focused");
  });

  it("投稿年が表示される", () => {
    renderCard(basePost);
    expect(screen.getByText(/Jun 28, 2007/)).toBeInTheDocument();
  });
});
