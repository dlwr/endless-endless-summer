import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AboutPage } from "./AboutPage";

describe("AboutPage", () => {
  it("GitHub Issues へのリンクがある", () => {
    render(<AboutPage />);
    expect(screen.getByRole("link", { name: "GitHub Issues" })).toHaveAttribute(
      "href",
      "https://github.com/dlwr/endless-endless-summer/issues",
    );
  });
});
