import { render, screen } from "@testing-library/react";
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
});
