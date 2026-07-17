import { useEffect, useState } from "react";
import type { Me } from "../shared/types";
import { fetchMe } from "./api";
import { Feed } from "./components/Feed";
import { LoginScreen } from "./components/LoginScreen";

type AuthState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authed"; me: Me };

export function App() {
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    fetchMe()
      .then((me) =>
        setAuth(me ? { status: "authed", me } : { status: "anonymous" }),
      )
      .catch(() => setAuth({ status: "anonymous" }));
  }, []);

  if (auth.status === "loading") return null;
  if (auth.status === "anonymous") return <LoginScreen />;
  return <Feed me={auth.me} />;
}
