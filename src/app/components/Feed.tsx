import { useEffect, useRef, useState } from "react";
import type { Me } from "../../shared/types";
import { useFeed } from "../hooks/useFeed";
import { PostCard } from "./PostCard";

export function Feed({ me }: { me: Me }) {
  const { posts, loading, loadMore, reroll: _reroll } = useFeed();
  const [focusedIndex, _setFocusedIndex] = useState(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadMore();
  }, [loadMore]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMore();
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  return (
    <div data-testid="feed" className="feed">
      <header className="feed-header">
        <h1>endless endless summer</h1>
        <span className="feed-user">{me.userName}</span>
      </header>
      <main className="feed-posts">
        {posts.map((post, index) => (
          <PostCard
            // biome-ignore lint/suspicious/noArrayIndexKey: 重複ポスト許容のため index を含める
            key={`${post.id}:${index}`}
            post={post}
            focused={index === focusedIndex}
            onLike={() => {}}
            onReblog={() => {}}
            onReblogDialog={() => {}}
          />
        ))}
        <div ref={sentinelRef} className="feed-sentinel">
          {loading ? "loading…" : ""}
        </div>
      </main>
    </div>
  );
}
