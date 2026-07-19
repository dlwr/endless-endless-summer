import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

afterEach(() => {
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
