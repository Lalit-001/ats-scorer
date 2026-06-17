/**
 * Rotating pool of Gemini API keys for free-tier quota stretching.
 *
 * Each key has per-minute (RPM) and per-day (RPD) budgets tracked in a RateStore
 * (Redis in production, an in-memory fake in tests). `acquire()` hands out the
 * next key that is under budget and not cooling down; on a 429 the caller calls
 * `penalize()` to cool that key down and retries with the next one.
 */

const RPM_WINDOW_SECONDS = 60;
const RPD_WINDOW_SECONDS = 60 * 60 * 24;
const DEFAULT_COOLDOWN_SECONDS = 60;

export interface RateStore {
  /** Current usage count for a counter key within its window. */
  count(key: string, windowSeconds: number): Promise<number>;
  /** Record one usage hit, (re)setting the window TTL. */
  hit(key: string, windowSeconds: number): Promise<void>;
  /** Mark an API key as cooling down for `seconds`. */
  cooldown(key: string, seconds: number): Promise<void>;
  isCoolingDown(key: string): Promise<boolean>;
}

export class GeminiQuotaExhaustedError extends Error {
  constructor() {
    super("All Gemini API keys are rate-limited or over quota");
    this.name = "GeminiQuotaExhaustedError";
  }
}

export interface KeyPoolOptions {
  rpm: number;
  rpd: number;
  store: RateStore;
}

export class GeminiKeyPool {
  private cursor = 0;

  constructor(
    private readonly keys: string[],
    private readonly opts: KeyPoolOptions,
  ) {
    if (keys.length === 0) {
      throw new Error("GeminiKeyPool requires at least one API key");
    }
  }

  async acquire(): Promise<string> {
    const n = this.keys.length;
    for (let offset = 0; offset < n; offset++) {
      const key = this.keys[(this.cursor + offset) % n];

      if (await this.opts.store.isCoolingDown(key)) continue;

      const rpm = await this.opts.store.count(`rpm:${key}`, RPM_WINDOW_SECONDS);
      const rpd = await this.opts.store.count(`rpd:${key}`, RPD_WINDOW_SECONDS);
      if (rpm >= this.opts.rpm || rpd >= this.opts.rpd) continue;

      await this.opts.store.hit(`rpm:${key}`, RPM_WINDOW_SECONDS);
      await this.opts.store.hit(`rpd:${key}`, RPD_WINDOW_SECONDS);
      this.cursor = (this.cursor + offset + 1) % n;
      return key;
    }
    throw new GeminiQuotaExhaustedError();
  }

  async penalize(key: string, seconds: number = DEFAULT_COOLDOWN_SECONDS): Promise<void> {
    await this.opts.store.cooldown(key, seconds);
  }
}
