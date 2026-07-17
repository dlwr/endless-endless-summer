import { useCallback, useRef, useState } from "react";
import type { FeedPost } from "../../shared/types";
import { fetchFeed } from "../api";

export function useFeed() {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);
  const generation = useRef(0);

  const loadMore = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    const gen = generation.current;
    try {
      const batch = await fetchFeed();
      if (generation.current === gen) setPosts((prev) => [...prev, ...batch]);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  const reroll = useCallback(async () => {
    generation.current++;
    const gen = generation.current;
    setPosts([]);
    setLoading(true);
    try {
      const batch = await fetchFeed();
      if (generation.current === gen) setPosts(batch);
    } finally {
      setLoading(false);
    }
  }, []);

  return { posts, loading, loadMore, reroll };
}
