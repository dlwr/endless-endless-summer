import type { NpfFormatting } from "../../shared/types";

export type TextSegment = {
  text: string;
  bold: boolean;
  italic: boolean;
  href: string | null;
};

export function applyFormatting(
  text: string,
  formatting: NpfFormatting[] = [],
): TextSegment[] {
  const boundaries = new Set([0, text.length]);
  for (const f of formatting) {
    boundaries.add(f.start);
    boundaries.add(f.end);
  }
  const points = [...boundaries].sort((a, b) => a - b);
  const segments: TextSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    const active = formatting.filter((f) => f.start <= start && end <= f.end);
    segments.push({
      text: text.slice(start, end),
      bold: active.some((f) => f.type === "bold"),
      italic: active.some((f) => f.type === "italic"),
      href: active.find((f) => f.type === "link")?.url ?? null,
    });
  }
  return segments.filter((s) => s.text.length > 0);
}
