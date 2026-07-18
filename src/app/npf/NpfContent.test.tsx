import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NpfContent } from "./NpfContent";

describe("NpfContent", () => {
  it("text ブロックを段落として描画する", () => {
    render(<NpfContent blocks={[{ type: "text", text: "hello" }]} />);
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("heading1 subtype は見出しになる", () => {
    render(
      <NpfContent
        blocks={[{ type: "text", text: "title", subtype: "heading1" }]}
      />,
    );
    expect(screen.getByRole("heading")).toHaveTextContent("title");
  });

  it("image ブロックは最大幅のメディアを img で描画する", () => {
    render(
      <NpfContent
        blocks={[
          {
            type: "image",
            media: [
              { url: "https://img/small", width: 250 },
              { url: "https://img/big", width: 1280 },
            ],
            alt_text: "a cat",
          },
        ]}
      />,
    );
    expect(screen.getByAltText("a cat")).toHaveAttribute(
      "src",
      "https://img/big",
    );
  });

  it("link ブロックはアンカーになる", () => {
    render(
      <NpfContent blocks={[{ type: "link", url: "https://x", title: "X" }]} />,
    );
    expect(screen.getByRole("link", { name: "X" })).toHaveAttribute(
      "href",
      "https://x",
    );
  });

  it("link スパン付きテキストはアンカーを含む", () => {
    render(
      <NpfContent
        blocks={[
          {
            type: "text",
            text: "go here",
            formatting: [{ start: 3, end: 7, type: "link", url: "https://y" }],
          },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: "here" })).toHaveAttribute(
      "href",
      "https://y",
    );
  });

  it("video ブロックは media があれば video 要素になる", () => {
    const { container } = render(
      <NpfContent
        blocks={[{ type: "video", media: { url: "https://v/mp4" } }]}
      />,
    );
    expect(container.querySelector("video")).toHaveAttribute(
      "src",
      "https://v/mp4",
    );
  });

  it("link ブロックの url が javascript: の場合はアンカーを描画しない", () => {
    const { container } = render(
      <NpfContent
        blocks={[
          { type: "link", url: "javascript:alert(1)", title: "危険なリンク" },
        ]}
      />,
    );
    expect(within(container).queryByRole("link")).not.toBeInTheDocument();
    expect(within(container).getByText("危険なリンク")).toBeInTheDocument();
  });

  it("video ブロックの embed_iframe url が javascript: の場合は iframe を描画しない", () => {
    const { container } = render(
      <NpfContent
        blocks={[
          {
            type: "video",
            embed_iframe: { url: "javascript:alert(1)" },
          },
        ]}
      />,
    );
    expect(container.querySelector("iframe")).not.toBeInTheDocument();
  });

  it("video ブロックの embed_iframe は sandbox 属性を持つ", () => {
    const { container } = render(
      <NpfContent
        blocks={[
          {
            type: "video",
            embed_iframe: { url: "https://example.com/embed" },
          },
        ]}
      />,
    );
    expect(container.querySelector("iframe")).toHaveAttribute(
      "sandbox",
      "allow-scripts allow-same-origin allow-presentation",
    );
  });
});
