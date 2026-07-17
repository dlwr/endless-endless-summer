export const TUMBLR_EPOCH = Date.UTC(2007, 0, 1) / 1000;

export type Rng = () => number;

function yearOf(ts: number): number {
  return new Date(ts * 1000).getUTCFullYear();
}

function startOfYear(year: number): number {
  return Date.UTC(year, 0, 1) / 1000;
}

export function sampleTimestamp(
  notBefore: number,
  now: number,
  rng: Rng,
): number {
  const floor = Math.max(notBefore, TUMBLR_EPOCH);
  const startYear = yearOf(floor);
  const endYear = yearOf(now);
  const year = startYear + Math.floor(rng() * (endYear - startYear + 1));
  const lo = Math.max(floor, startOfYear(year));
  const hi = Math.min(now, startOfYear(year + 1) - 1);
  return lo + Math.floor(rng() * (hi - lo + 1));
}
