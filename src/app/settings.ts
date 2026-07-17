import type { PostKind } from "../shared/types";

export type FilterSettings = { kinds: Record<PostKind, boolean> };

export const DEFAULT_SETTINGS: FilterSettings = {
  kinds: { text: true, image: true, link: true, audio: true, video: true },
};

const KEY = "ees:settings";

export function loadSettings(): FilterSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<FilterSettings>;
    return { kinds: { ...DEFAULT_SETTINGS.kinds, ...parsed.kinds } };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: FilterSettings): void {
  localStorage.setItem(KEY, JSON.stringify(settings));
}
