import { useCallback, useEffect, useId, useState } from "react";
import type { FeedPost, MeBlog } from "../../shared/types";

type Props = {
  post: FeedPost;
  blogs: MeBlog[];
  onSubmit: (input: {
    blogName: string;
    comment: string;
    tags: string;
  }) => void;
  onClose: () => void;
};

export function ReblogDialog({ post, blogs, onSubmit, onClose }: Props) {
  const [blogName, setBlogName] = useState(
    blogs.find((b) => b.primary)?.name ?? blogs[0]?.name ?? "",
  );
  const [comment, setComment] = useState("");
  const [tags, setTags] = useState("");
  const commentId = useId();
  const tagsId = useId();

  const submit = useCallback(
    () => onSubmit({ blogName, comment, tags }),
    [onSubmit, blogName, comment, tags],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, submit]);

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true">
      <div className="reblog-dialog">
        <h2>Reblog from {post.blogName}</h2>
        <label htmlFor={commentId}>Comment</label>
        <textarea
          id={commentId}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          // biome-ignore lint/a11y/noAutofocus: キーボード操作フローの起点
          autoFocus
        />
        <label htmlFor={tagsId}>Tags</label>
        <input
          id={tagsId}
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="comma, separated, tags"
        />
        <select value={blogName} onChange={(e) => setBlogName(e.target.value)}>
          {blogs.map((blog) => (
            <option key={blog.uuid} value={blog.name}>
              {blog.name}
            </option>
          ))}
        </select>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={submit}>
            Reblog
          </button>
        </div>
      </div>
    </div>
  );
}
