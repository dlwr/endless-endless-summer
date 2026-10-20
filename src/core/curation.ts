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

function rank(oldest: Oldest | undefined): number {
  if (!oldest) return Number.NEGATIVE_INFINITY;
  if (oldest.kind === "empty") return Number.POSITIVE_INFINITY;
  return oldest.ts;
}

export function sortCandidates(
  blogs: CurationBlog[],
  protectedNames: Set<string>,
): CurationBlog[] {
  return [...blogs].sort((a, b) => {
    const pa = protectedNames.has(a.name) ? 1 : 0;
    const pb = protectedNames.has(b.name) ? 1 : 0;
    if (pa !== pb) return pa - pb;
    const ra = rank(a.oldest);
    const rb = rank(b.oldest);
    if (ra === rb) return 0;
    return rb > ra ? 1 : -1;
  });
}
