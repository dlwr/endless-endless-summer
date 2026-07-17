import type { FeedPost } from "../../shared/types";
import { NpfContent } from "../npf/NpfContent";
import { safeUrl } from "../npf/safe-url";

type Props = {
  post: FeedPost;
  focused: boolean;
  onLike: () => void;
  onReblog: () => void;
  onReblogDialog: () => void;
};

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function PostCard({
  post,
  focused,
  onLike,
  onReblog,
  onReblogDialog,
}: Props) {
  const href = safeUrl(post.postUrl);
  return (
    <article className={`post-card${focused ? " focused" : ""}`}>
      <header className="post-header">
        <span className="post-blog-name">{post.blogName}</span>
        {href ? (
          <a
            className="post-date"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {formatDate(post.timestamp)}
          </a>
        ) : (
          <span className="post-date">{formatDate(post.timestamp)}</span>
        )}
      </header>
      {post.trail.map((item, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: trail は順序固定
        <section className="trail-item" key={i}>
          <h4 className="trail-blog-name">{item.blogName}</h4>
          <NpfContent blocks={item.content} />
        </section>
      ))}
      {post.content.length > 0 ? (
        <section className="own-content">
          <NpfContent blocks={post.content} />
        </section>
      ) : null}
      <footer className="post-footer">
        <div className="post-tags">
          {post.tags.map((tag) => (
            <span className="post-tag" key={tag}>
              #{tag}
            </span>
          ))}
        </div>
        <div className="post-actions">
          <button type="button" onClick={onLike} aria-label="like">
            {post.liked ? "♥" : "♡"}
          </button>
          <button type="button" onClick={onReblog} aria-label="reblog">
            ⟳
          </button>
          <button
            type="button"
            onClick={onReblogDialog}
            aria-label="reblog with comment"
          >
            ⟳+
          </button>
        </div>
      </footer>
    </article>
  );
}
