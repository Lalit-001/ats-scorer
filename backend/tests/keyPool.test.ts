import { describe, it, expect, beforeEach } from "vitest";
import {
  GeminiKeyPool,
  GeminiQuotaExhaustedError,
  type RateStore,
} from "../src/llm/keyPool";

class FakeRateStore implements RateStore {
  counts = new Map<string, number>();
  cooling = new Set<string>();
  async count(key: string): Promise<number> {
    return this.counts.get(key) ?? 0;
  }
  async hit(key: string): Promise<void> {
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
  }
  async cooldown(key: string): Promise<void> {
    this.cooling.add(key);
  }
  async isCoolingDown(key: string): Promise<boolean> {
    return this.cooling.has(key);
  }
}

describe("GeminiKeyPool", () => {
  let store: FakeRateStore;

  beforeEach(() => {
    store = new FakeRateStore();
  });

  it("returns a key when one is under budget", async () => {
    const pool = new GeminiKeyPool(["k1"], { rpm: 10, rpd: 100, store });
    expect(await pool.acquire()).toBe("k1");
  });

  it("round-robins across keys", async () => {
    const pool = new GeminiKeyPool(["k1", "k2"], { rpm: 10, rpd: 100, store });
    expect(await pool.acquire()).toBe("k1");
    expect(await pool.acquire()).toBe("k2");
    expect(await pool.acquire()).toBe("k1");
  });

  it("skips a key that has hit its per-minute limit", async () => {
    store.counts.set("rpm:k1", 1); // k1 already at the rpm=1 limit
    const pool = new GeminiKeyPool(["k1", "k2"], { rpm: 1, rpd: 100, store });
    expect(await pool.acquire()).toBe("k2");
  });

  it("skips a key that has hit its per-day limit", async () => {
    store.counts.set("rpd:k1", 100);
    const pool = new GeminiKeyPool(["k1", "k2"], { rpm: 10, rpd: 100, store });
    expect(await pool.acquire()).toBe("k2");
  });

  it("skips a key that is cooling down after a 429", async () => {
    const pool = new GeminiKeyPool(["k1", "k2"], { rpm: 10, rpd: 100, store });
    await pool.penalize("k1");
    expect(await pool.acquire()).toBe("k2");
  });

  it("throws when every key is exhausted", async () => {
    const pool = new GeminiKeyPool(["k1"], { rpm: 2, rpd: 100, store });
    await pool.acquire();
    await pool.acquire();
    await expect(pool.acquire()).rejects.toBeInstanceOf(GeminiQuotaExhaustedError);
  });
});
