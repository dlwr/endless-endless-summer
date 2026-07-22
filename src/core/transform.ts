export function toCamel(s: string): string {
  return s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

export function deepCamel<T = unknown>(value: unknown): T {
  if (Array.isArray(value)) return value.map((v) => deepCamel(v)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[toCamel(k)] = deepCamel(v);
    return out as T;
  }
  return value as T;
}
