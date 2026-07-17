import { useEffect } from "react";
import { resolveShortcut, type ShortcutAction } from "../shortcuts";

export function useShortcuts(
  handler: (action: ShortcutAction) => void,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      const action = resolveShortcut(e);
      if (!action) return;
      e.preventDefault();
      handler(action);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handler, enabled]);
}
