import { useCallback, useEffect, useRef, useState } from "react";
import type { Me } from "../../shared/types";
import { useFeed } from "../hooks/useFeed";
import { useShortcuts } from "../hooks/useShortcuts";
import type { ShortcutAction } from "../shortcuts";
import { HelpOverlay } from "./HelpOverlay";
import { PostCard } from "./PostCard";

export function Feed({ me }: { me: Me }) {
  const { posts, loading, loadMore, reroll } = useFeed();
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

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

  const focusPost = useCallback((index: number) => {
    setFocusedIndex(index);
    cardRefs.current[index]?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }, []);

  const handleAction = useCallback(
    (action: ShortcutAction) => {
      const post = posts[focusedIndex];
      switch (action) {
        case "next":
          if (focusedIndex < posts.length - 1) focusPost(focusedIndex + 1);
          break;
        case "prev":
          if (focusedIndex > 0) focusPost(focusedIndex - 1);
          break;
        case "open":
          if (post) window.open(post.postUrl, "_blank", "noopener");
          break;
        case "reroll":
          setFocusedIndex(0);
          reroll();
          break;
        case "help":
          setHelpOpen((open) => !open);
          break;
        default:
          // like / reblog / reblogDialog は Task 11-12 で結線
          break;
      }
    },
    [posts, focusedIndex, focusPost, reroll],
  );

  useShortcuts(handleAction, !helpOpen || true);

  return (
    <div data-testid="feed" className="feed">
      <header className="feed-header">
        <h1>endless endless summer</h1>
        <span className="feed-user">{me.userName}</span>
      </header>
      <main className="feed-posts">
        {posts.map((post, index) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: 重複ポスト許容のため index を含める
            key={`${post.id}:${index}`}
            ref={(el) => {
              cardRefs.current[index] = el;
            }}
          >
            <PostCard
              post={post}
              focused={index === focusedIndex}
              onLike={() => {}}
              onReblog={() => {}}
              onReblogDialog={() => {}}
            />
          </div>
        ))}
        <div ref={sentinelRef} className="feed-sentinel">
          {loading ? "loading…" : ""}
        </div>
      </main>
      {helpOpen ? <HelpOverlay onClose={() => setHelpOpen(false)} /> : null}
    </div>
  );
}
