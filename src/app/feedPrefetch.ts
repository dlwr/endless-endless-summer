import type { FeedPost } from "../shared/types";
import { fetchFeed } from "./api";

let prefetch: Promise<FeedPost[]> | null = null;

export function startFeedPrefetch(): void {
  if (!prefetch) prefetch = fetchFeed();
}

// 一度だけ消費される。未開始/消費済みなら null
export function takeFeedPrefetch(): Promise<FeedPost[]> | null {
  const p = prefetch;
  prefetch = null;
  return p;
}
