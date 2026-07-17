import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedPost, Me } from "../../shared/types";
import { likePost, reblogPost } from "../api";
import { useFeed } from "../hooks/useFeed";
import { useShortcuts } from "../hooks/useShortcuts";
import type { ShortcutAction } from "../shortcuts";
import { HelpOverlay } from "./HelpOverlay";
import { PostCard } from "./PostCard";
import { Toast } from "./Toast";

export function Feed({ me }: { me: Me }) {
  const { posts, loading, loadMore, reroll } = useFeed();
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [postOverrides, setPostOverrides] = useState<
    Record<number, Partial<FeedPost>>
  >({});
  const [toast, setToast] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => {
    loadMore();
  }, [loadMore]);

  useEffect(() => {
    return () => clearTimeout(toastTimer.current);
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  }, []);

  const viewPost = useCallback(
    (index: number): FeedPost | undefined =>
      posts[index] ? { ...posts[index], ...postOverrides[index] } : undefined,
    [posts, postOverrides],
  );

  const toggleLike = useCallback(
    (index: number) => {
      const post = viewPost(index);
      if (!post) return;
      const nextLiked = !post.liked;
      setPostOverrides((prev) => ({
        ...prev,
        [index]: { ...prev[index], liked: nextLiked },
      }));
      likePost(post.id, post.reblogKey, nextLiked).catch(() => {
        setPostOverrides((prev) => ({
          ...prev,
          [index]: { ...prev[index], liked: !nextLiked },
        }));
        showToast("Like failed");
      });
    },
    [viewPost, showToast],
  );

  const instantReblog = useCallback(
    (index: number) => {
      const post = viewPost(index);
      if (!post) return;
      const primary = me.blogs.find((b) => b.primary)?.name ?? "";
      reblogPost({ id: post.id, reblogKey: post.reblogKey })
        .then(() => showToast(`Reblogged to ${primary}`))
        .catch(() => showToast("Reblog failed"));
    },
    [viewPost, me.blogs, showToast],
  );

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
        case "like":
          toggleLike(focusedIndex);
          break;
        case "reblog":
          instantReblog(focusedIndex);
          break;
        default:
          // reblogDialog は Task 12 で結線
          break;
      }
    },
    [posts, focusedIndex, focusPost, reroll, toggleLike, instantReblog],
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
              post={viewPost(index) ?? post}
              focused={index === focusedIndex}
              onLike={() => toggleLike(index)}
              onReblog={() => instantReblog(index)}
              onReblogDialog={() => {}}
            />
          </div>
        ))}
        <div ref={sentinelRef} className="feed-sentinel">
          {loading ? "loading…" : ""}
        </div>
      </main>
      {helpOpen ? <HelpOverlay onClose={() => setHelpOpen(false)} /> : null}
      <Toast message={toast} />
    </div>
  );
}
