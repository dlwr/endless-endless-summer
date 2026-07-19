import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FeedPost, Me } from "../../shared/types";
import { likePost, reblogPost } from "../api";
import { useFeed } from "../hooks/useFeed";
import { useShortcuts } from "../hooks/useShortcuts";
import { safeUrl } from "../npf/safe-url";
import type { FilterSettings } from "../settings";
import { loadSettings, saveSettings } from "../settings";
import type { ShortcutAction } from "../shortcuts";
import { HelpOverlay } from "./HelpOverlay";
import { PostCard } from "./PostCard";
import { ReblogDialog } from "./ReblogDialog";
import { SettingsPanel } from "./SettingsPanel";
import { Toast } from "./Toast";

const MAX_CONSECUTIVE_EMPTY_ROUNDS = 3;

// backoff の解除時刻(Unix 秒)をローカル時刻の HH:MM で表示する。
function formatLocalTime(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function Feed({ me }: { me: Me }) {
  const { posts, loading, error, rateLimitedUntil, loadMore, reroll } =
    useFeed();
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [dialogIndex, setDialogIndex] = useState<number | null>(null);
  const [postOverrides, setPostOverrides] = useState<
    Record<number, Partial<FeedPost>>
  >({});
  const [toast, setToast] = useState<string | null>(null);
  const [settings, setSettings] = useState(loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  // sentinel が交差通知を出しても visiblePosts が増えなかった("空振り")回数。
  // フィルタに一致するポストが無い場合に fetch を無限に繰り返さないための上限に使う。
  const emptyRoundsRef = useRef(0);
  const prevVisibleLengthRef = useRef(0);
  // 末尾ポストで j を押して loadMore() した後、新バッチ到着で自動的に
  // 次のポストへフォーカスを進めるためのフラグ。
  const pendingAdvanceRef = useRef(false);

  const visiblePosts = useMemo(
    () => posts.filter((p) => settings.kinds[p.kind]),
    [posts, settings],
  );

  const updateSettings = useCallback((next: FilterSettings) => {
    setSettings(next);
    saveSettings(next);
    // フィルタ変更で visiblePosts の index 空間がずれるため、focus と
    // index キー付きの楽観更新オーバーライドをリセットする
    // (Task 11 の reroll 修正と同じクラスのバグを防ぐ)
    setFocusedIndex(0);
    setPostOverrides({});
    setDialogIndex(null);
    emptyRoundsRef.current = 0;
    pendingAdvanceRef.current = false;
  }, []);

  useEffect(() => {
    loadMore();
  }, [loadMore]);

  useEffect(() => {
    return () => clearTimeout(toastTimer.current);
  }, []);

  useEffect(() => {
    // /api/feed が 401 を返したのはセッションが切れたということなので、
    // リロードして認証ゲート(ログイン画面)を再表示させる。
    if (error?.includes("401")) {
      location.reload();
    }
  }, [error]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  }, []);

  const viewPost = useCallback(
    (index: number): FeedPost | undefined =>
      visiblePosts[index]
        ? { ...visiblePosts[index], ...postOverrides[index] }
        : undefined,
    [visiblePosts, postOverrides],
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: posts.length は effect 本体では未参照だが、observer 再生成のトリガーとして意図的に依存配列に含めている(効果内のコメント参照)
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    // visiblePosts が増えていれば、今まさに有効なフィルタでコンテンツが
    // 見つかっているということなので空振りカウントをリセットする。
    if (visiblePosts.length > prevVisibleLengthRef.current) {
      emptyRoundsRef.current = 0;
    }
    prevVisibleLengthRef.current = visiblePosts.length;
    // posts.length も deps に含めることで、バッチが 0 件の visible ポストしか
    // 追加しなかった場合(フィルタに一致するポストが無いバッチ)でも observer を
    // 作り直し、交差通知を再度発火させる。visiblePosts.length だけを見ていると、
    // 生の posts が増えても visible が 0 のままなら deps が変化せず observer が
    // 作り直されない → sentinel の交差比率も変化しないので二度と loadMore が
    // 呼ばれず feed が停止してしまう。
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      if (emptyRoundsRef.current >= MAX_CONSECUTIVE_EMPTY_ROUNDS) return;
      emptyRoundsRef.current += 1;
      loadMore();
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, posts.length, visiblePosts.length]);

  const focusPost = useCallback((index: number) => {
    setFocusedIndex(index);
    cardRefs.current[index]?.scrollIntoView({
      block: "start",
      behavior: "smooth",
    });
  }, []);

  // 末尾ポストで j した後、新バッチが visiblePosts に反映されたら自動的に
  // 次のポストへフォーカスを進める(Bug 1: 最後のポストで j が無反応になる問題への対処)。
  useEffect(() => {
    if (pendingAdvanceRef.current && visiblePosts.length > focusedIndex + 1) {
      pendingAdvanceRef.current = false;
      focusPost(focusedIndex + 1);
    }
  }, [visiblePosts.length, focusedIndex, focusPost]);

  const handleAction = useCallback(
    (action: ShortcutAction) => {
      const post = visiblePosts[focusedIndex];
      switch (action) {
        case "next":
          if (focusedIndex < visiblePosts.length - 1) {
            focusPost(focusedIndex + 1);
          } else {
            pendingAdvanceRef.current = true;
            loadMore();
          }
          break;
        case "prev":
          if (focusedIndex > 0) focusPost(focusedIndex - 1);
          break;
        case "open": {
          const url = post ? safeUrl(post.postUrl) : null;
          if (url) window.open(url, "_blank", "noopener");
          break;
        }
        case "reroll":
          setFocusedIndex(0);
          setPostOverrides({});
          emptyRoundsRef.current = 0;
          pendingAdvanceRef.current = false;
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
        case "reblogDialog":
          if (viewPost(focusedIndex)) setDialogIndex(focusedIndex);
          break;
        default:
          break;
      }
    },
    [
      visiblePosts,
      focusedIndex,
      focusPost,
      loadMore,
      reroll,
      toggleLike,
      instantReblog,
      viewPost,
    ],
  );

  useShortcuts(handleAction, dialogIndex === null && !settingsOpen);

  const logout = useCallback(() => {
    fetch("/auth/logout", { method: "POST" })
      .then(() => {
        location.href = "/";
      })
      .catch(() => showToast("Logout failed"));
  }, [showToast]);

  const submitDialogReblog = useCallback(
    (input: { blogName: string; comment: string; tags: string }) => {
      const post = dialogIndex !== null ? viewPost(dialogIndex) : undefined;
      if (!post) return;
      setDialogIndex(null);
      reblogPost({
        id: post.id,
        reblogKey: post.reblogKey,
        blogName: input.blogName,
        comment: input.comment || undefined,
        tags: input.tags || undefined,
      })
        .then(() => showToast(`Reblogged to ${input.blogName}`))
        .catch(() => showToast("Reblog failed"));
    },
    [dialogIndex, viewPost, showToast],
  );

  return (
    <div data-testid="feed" className="feed">
      <header className="feed-header">
        <h1>endless endless summer</h1>
        <span className="feed-user">{me.userName}</span>
        <button
          type="button"
          aria-label="settings"
          onClick={() => setSettingsOpen(true)}
        >
          ⚙
        </button>
        <button type="button" aria-label="logout" onClick={logout}>
          Logout
        </button>
        <a href="/about" aria-label="about">
          about
        </a>
      </header>
      <main className="feed-posts">
        {visiblePosts.map((post, index) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: 重複ポスト許容のため index を含める
            key={`${post.id}:${index}`}
            className="post-slot"
            ref={(el) => {
              cardRefs.current[index] = el;
            }}
          >
            <PostCard
              post={viewPost(index) ?? post}
              focused={index === focusedIndex}
              onLike={() => toggleLike(index)}
              onReblog={() => instantReblog(index)}
              onReblogDialog={() => setDialogIndex(index)}
            />
          </div>
        ))}
        <div ref={sentinelRef} className="feed-sentinel">
          {rateLimitedUntil ? (
            <div className="feed-rate-limited">
              <span>
                Tumblr rate limit — resting until{" "}
                {formatLocalTime(rateLimitedUntil)}
              </span>
              <button type="button" onClick={() => loadMore()}>
                Retry
              </button>
            </div>
          ) : error ? (
            <div className="feed-error">
              <span>{error}</span>
              <button type="button" onClick={() => loadMore()}>
                Retry
              </button>
            </div>
          ) : loading ? (
            "loading…"
          ) : (
            ""
          )}
        </div>
      </main>
      {helpOpen ? <HelpOverlay onClose={() => setHelpOpen(false)} /> : null}
      {dialogIndex !== null && viewPost(dialogIndex) ? (
        <ReblogDialog
          post={viewPost(dialogIndex) as FeedPost}
          blogs={me.blogs}
          onSubmit={submitDialogReblog}
          onClose={() => setDialogIndex(null)}
        />
      ) : null}
      <Toast message={toast} />
      {settingsOpen ? (
        <SettingsPanel
          settings={settings}
          onChange={updateSettings}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </div>
  );
}
