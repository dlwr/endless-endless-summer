import { describe, expect, it } from "vitest";
import { type Rng, sampleTimestamp, TUMBLR_EPOCH } from "./sampling";

function seqRng(values: number[]): Rng {
  let i = 0;
  return () => values[i++ % values.length];
}

const ts = (y: number, m = 0, d = 1) => Date.UTC(y, m, d) / 1000;

describe("sampleTimestamp", () => {
  it("rng が常に 0 なら TUMBLR_EPOCH を返す", () => {
    const result = sampleTimestamp(TUMBLR_EPOCH, ts(2020), seqRng([0]));
    expect(result).toBe(TUMBLR_EPOCH);
  });

  it("結果は常に notBefore 以上", () => {
    const notBefore = ts(2015, 6);
    const result = sampleTimestamp(notBefore, ts(2015, 11, 31), seqRng([0, 0]));
    expect(result).toBeGreaterThanOrEqual(notBefore);
  });

  it("結果は常に now 以下", () => {
    const now = ts(2015, 11, 31);
    const result = sampleTimestamp(
      ts(2015, 6),
      now,
      seqRng([0.999999, 0.999999]),
    );
    expect(result).toBeLessThanOrEqual(now);
  });

  it("1つ目の乱数で年が一様に選ばれる(2007〜2010 の 4 年)", () => {
    const now = ts(2010, 11, 31);
    const years = [0, 1, 2, 3].map((k) => {
      const result = sampleTimestamp(
        TUMBLR_EPOCH,
        now,
        seqRng([k / 4 + 0.001, 0.5]),
      );
      return new Date(result * 1000).getUTCFullYear();
    });
    expect(years).toEqual([2007, 2008, 2009, 2010]);
  });

  it("notBefore の年が選ばれたときは年初ではなく notBefore 側にクランプされる", () => {
    const notBefore = ts(2015, 6);
    const result = sampleTimestamp(
      notBefore,
      ts(2016, 11, 31),
      seqRng([0.1, 0]),
    );
    expect(result).toBe(notBefore);
  });
});
