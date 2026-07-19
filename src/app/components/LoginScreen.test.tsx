import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoginScreen } from "./LoginScreen";

describe("LoginScreen", () => {
  it("Terms & Privacy へのリンクがある", () => {
    render(<LoginScreen />);
    expect(
      screen.getByRole("link", { name: "Terms & Privacy" }),
    ).toHaveAttribute("href", "/about");
  });
});
