export type ShortcutAction =
  | "next"
  | "prev"
  | "like"
  | "reblog"
  | "reblogDialog"
  | "open"
  | "reroll"
  | "help";

type KeyEventLike = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
};

const MAP: Record<string, ShortcutAction> = {
  j: "next",
  k: "prev",
  t: "reblog",
  T: "reblogDialog",
  l: "like",
  o: "open",
  r: "reroll",
  "?": "help",
};

export function resolveShortcut(e: KeyEventLike): ShortcutAction | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  return MAP[e.key] ?? null;
}
