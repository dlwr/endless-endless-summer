import { useEffect, useState } from "react";
import type { Me } from "../shared/types";
import { fetchMe } from "./api";
import { AboutPage } from "./components/AboutPage";
import { Feed } from "./components/Feed";
import { LoginScreen } from "./components/LoginScreen";
import { startFeedPrefetch } from "./feedPrefetch";

type AuthState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authed"; me: Me };

export function App() {
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    // /api/me の応答を待たず feed の先読みを始める(未ログインなら 401 で
    // reject するだけで Tumblr の API 予算は消費しない)。Feed 側の初回
    // loadMore がこれを消費することで、fetchMe → Feed マウント → loadMore
    // という直列ウォーターフォールを解消する。/about は Feed を描画しない
    // ので先読みしない。
    if (window.location.pathname !== "/about") {
      startFeedPrefetch();
    }
    fetchMe()
      .then((me) =>
        setAuth(me ? { status: "authed", me } : { status: "anonymous" }),
      )
      .catch(() => setAuth({ status: "anonymous" }));
  }, []);

  if (window.location.pathname === "/about") return <AboutPage />;
  if (auth.status === "loading") return null;
  if (auth.status === "anonymous") return <LoginScreen />;
  return <Feed me={auth.me} />;
}
