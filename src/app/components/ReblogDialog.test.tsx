import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FeedPost, MeBlog } from "../../shared/types";
import { ReblogDialog } from "./ReblogDialog";

const post: FeedPost = {
  id: "1",
  blogName: "b",
  postUrl: "https://b.tumblr.com/post/1",
  timestamp: 1_500_000_000,
  tags: [],
  reblogKey: "rk",
  liked: false,
  kind: "text",
  content: [{ type: "text", text: "content" }],
  trail: [],
};

const blogs: MeBlog[] = [
  { name: "secondary", title: "2nd", primary: false, uuid: "u2" },
  { name: "mainblog", title: "Main", primary: true, uuid: "u1" },
];

afterEach(() => {
  cleanup();
});

describe("ReblogDialog", () => {
  it("投稿先はプライマリブログがデフォルト", () => {
    render(
      <ReblogDialog
        post={post}
        blogs={blogs}
        onSubmit={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole("combobox")).toHaveValue("mainblog");
  });

  it("送信でコメント・タグ・投稿先が渡る", async () => {
    const onSubmit = vi.fn();
    render(
      <ReblogDialog
        post={post}
        blogs={blogs}
        onSubmit={onSubmit}
        onClose={() => {}}
      />,
    );
    await userEvent.type(screen.getByLabelText("Comment"), "nice");
    await userEvent.type(screen.getByLabelText("Tags"), "a, b");
    await userEvent.selectOptions(screen.getByRole("combobox"), "secondary");
    await userEvent.click(screen.getByRole("button", { name: "Reblog" }));
    expect(onSubmit).toHaveBeenCalledWith({
      blogName: "secondary",
      comment: "nice",
      tags: "a, b",
    });
  });

  it("Esc で onClose が呼ばれる", async () => {
    const onClose = vi.fn();
    render(
      <ReblogDialog
        post={post}
        blogs={blogs}
        onSubmit={() => {}}
        onClose={onClose}
      />,
    );
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
