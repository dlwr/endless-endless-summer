export type Oldest = { kind: "found"; ts: number } | { kind: "empty" };

export type CurationBlog = {
  name: string;
  url: string;
  title: string;
  updated: number;
  posts: number;
  followedAt: number;
  oldest: Oldest | undefined;
};

export type SortKey = "name" | "oldest" | "posts" | "updated" | "followedAt";
export type SortOrder = { key: SortKey; dir: "asc" | "desc" };

const DEFAULT_ORDER: SortOrder = { key: "oldest", dir: "desc" };

function compareBy(key: SortKey, a: CurationBlog, b: CurationBlog): number {
  if (key === "name") return a.name.localeCompare(b.name);
  if (key === "oldest") {
    const ra = a.oldest?.kind === "found" ? a.oldest.ts : Infinity;
    const rb = b.oldest?.kind === "found" ? b.oldest.ts : Infinity;
    return ra === rb ? 0 : ra < rb ? -1 : 1;
  }
  return a[key] - b[key];
}

export function sortCandidates(
  blogs: CurationBlog[],
  protectedNames: Set<string>,
  order: SortOrder = DEFAULT_ORDER,
): CurationBlog[] {
  const sign = order.dir === "asc" ? 1 : -1;
  return [...blogs].sort((a, b) => {
    const pa = protectedNames.has(a.name) ? 1 : 0;
    const pb = protectedNames.has(b.name) ? 1 : 0;
    if (pa !== pb) return pa - pb;
    if (order.key === "oldest" && !a.oldest !== !b.oldest) {
      return a.oldest ? -1 : 1;
    }
    return sign * compareBy(order.key, a, b);
  });
}

export function filterBlogs(
  blogs: CurationBlog[],
  query: string,
): CurationBlog[] {
  const q = query.trim().toLowerCase();
  if (!q) return blogs;
  return blogs.filter(
    (b) =>
      b.name.toLowerCase().includes(q) || b.title.toLowerCase().includes(q),
  );
}
