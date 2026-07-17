import { useCallback, useRef, useState } from "react";
import type { FeedPost } from "../../shared/types";
import { fetchFeed } from "../api";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function useFeed() {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const rerolling = useRef(false);
  const generation = useRef(0);

  const loadMore = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    const gen = generation.current;
    try {
      const batch = await fetchFeed();
      if (generation.current === gen) {
        setPosts((prev) => [...prev, ...batch]);
        setError(null);
      }
    } catch (err) {
      if (generation.current === gen) setError(errorMessage(err));
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  const reroll = useCallback(async () => {
    // reroll 自身の多重発火は専用の ref で防ぐ。loadMore 進行中でも reroll は
    // 割り込んで実行し、古い loadMore の結果だけを generation で捨てる。
    if (rerolling.current) return;
    rerolling.current = true;
    inFlight.current = true;
    generation.current++;
    const gen = generation.current;
    setPosts([]);
    setLoading(true);
    try {
      const batch = await fetchFeed();
      if (generation.current === gen) {
        setPosts(batch);
        setError(null);
      }
    } catch (err) {
      if (generation.current === gen) setError(errorMessage(err));
    } finally {
      inFlight.current = false;
      rerolling.current = false;
      setLoading(false);
    }
  }, []);

  return { posts, loading, error, loadMore, reroll };
}
