import { useCallback, useRef, useState } from "react";
import type { FeedPost } from "../../shared/types";
import { fetchFeed } from "../api";

export function useFeed() {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);

  const loadMore = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const batch = await fetchFeed();
      setPosts((prev) => [...prev, ...batch]);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  const reroll = useCallback(async () => {
    setPosts([]);
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const batch = await fetchFeed();
      setPosts(batch);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  return { posts, loading, loadMore, reroll };
}
