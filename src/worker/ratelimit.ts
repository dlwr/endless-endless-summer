export type RateSnapshot = {
  hourRemaining: number;
  dayRemaining: number;
  hourResetAt: number;
  dayResetAt: number;
};

// Tumblr の hourRemaining/dayRemaining 実測しきい値。これを下回ったら backoff に入る。
const HOUR_REMAINING_THRESHOLD = 100;
const DAY_REMAINING_THRESHOLD = 300;

// TumblrRateLimitError(ヘッダー無しの 429)を受けたときの既定 backoff 秒数。
export const DEFAULT_TRIP_SECONDS = 300;

const BACKOFF_KEY = "ratelimit:backoff";

const HEADER_NAMES = [
  "x-ratelimit-perhour-remaining",
  "x-ratelimit-perday-remaining",
  "x-ratelimit-perhour-reset",
  "x-ratelimit-perday-reset",
] as const;

// Tumblr の x-ratelimit-* ヘッダーを読む。4 つ全て揃わなければ null(429 応答では
// ヘッダー自体が無いことがある)。reset 系は「解除までの残り秒数」なので、呼び出し
// 時刻 now を足して絶対 Unix 秒に変換してから保持する。
export function readRateHeaders(
  headers: Headers,
  now: number,
): RateSnapshot | null {
  const values: Record<(typeof HEADER_NAMES)[number], number> = {} as Record<
    (typeof HEADER_NAMES)[number],
    number
  >;
  for (const name of HEADER_NAMES) {
    const raw = headers.get(name);
    if (raw === null) return null;
    values[name] = Number(raw);
  }
  return {
    hourRemaining: values["x-ratelimit-perhour-remaining"],
    dayRemaining: values["x-ratelimit-perday-remaining"],
    hourResetAt: now + values["x-ratelimit-perhour-reset"],
    dayResetAt: now + values["x-ratelimit-perday-reset"],
  };
}

export class RateLimitGuard {
  constructor(private kv: KVNamespace) {}

  // backoff 中なら解除時刻(Unix 秒)を返す。平常時、または解除時刻を過ぎていれば null。
  async check(now: number): Promise<number | null> {
    const backoffAt = (await this.kv.get(BACKOFF_KEY, "json")) as number | null;
    if (backoffAt === null || backoffAt <= now) return null;
    return backoffAt;
  }

  // 直近レスポンスの残量を見て、しきい値未満なら該当する reset 時刻まで backoff する。
  // hour・day 両方がしきい値未満なら、両方の制限が解除されるまで待つ必要があるので
  // 遅い方(大きい方)の reset 時刻を採用する。
  async record(snapshot: RateSnapshot | null, now: number): Promise<void> {
    if (snapshot === null) return;
    let backoffAt: number | null = null;
    if (snapshot.hourRemaining < HOUR_REMAINING_THRESHOLD) {
      backoffAt = snapshot.hourResetAt;
    }
    if (snapshot.dayRemaining < DAY_REMAINING_THRESHOLD) {
      backoffAt =
        backoffAt === null
          ? snapshot.dayResetAt
          : Math.max(backoffAt, snapshot.dayResetAt);
    }
    // すでに過去の reset 時刻になっていたら backoff を書き込まない。
    // (書いても check() は素通しするので実害は無いが、既存の正しい backoff を
    // 誤って「解除済み」相当の値で上書きしないための安全策)
    if (backoffAt !== null && backoffAt > now) {
      await this.setBackoff(backoffAt);
    }
  }

  // Tumblr から 429 を受けたときに使う。ヘッダーが無く record() では backoff を
  // 判断できない場合の保険として、固定秒数だけ backoff する。
  async trip(now: number, seconds = DEFAULT_TRIP_SECONDS): Promise<void> {
    await this.setBackoff(now + seconds);
  }

  private async setBackoff(at: number): Promise<void> {
    await this.kv.put(BACKOFF_KEY, JSON.stringify(at));
  }
}
