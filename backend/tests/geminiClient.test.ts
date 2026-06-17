import { describe, it, expect, beforeEach } from "vitest";
import { callGeminiJson, type GeminiInvoke } from "../src/llm/geminiClient";
import {
  GeminiKeyPool,
  GeminiQuotaExhaustedError,
  type RateStore,
} from "../src/llm/keyPool";

class FakeRateStore implements RateStore {
  counts = new Map<string, number>();
  cooling = new Set<string>();
  async count(key: string) {
    return this.counts.get(key) ?? 0;
  }
  async hit(key: string) {
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
  }
  async cooldown(key: string) {
    this.cooling.add(key);
  }
  async isCoolingDown(key: string) {
    return this.cooling.has(key);
  }
}

const rateLimit = () => Object.assign(new Error("429 RESOURCE_EXHAUSTED"), { status: 429 });

describe("callGeminiJson", () => {
  let store: FakeRateStore;
  beforeEach(() => {
    store = new FakeRateStore();
  });

  it("parses and returns the JSON response on success", async () => {
    const pool = new GeminiKeyPool(["k1"], { rpm: 10, rpd: 100, store });
    const invoke: GeminiInvoke = async () => '{"matchScore": 80}';
    const result = await callGeminiJson(pool, { prompt: "hi" }, invoke);
    expect(result).toEqual({ matchScore: 80 });
  });

  it("fails over to another key on a 429 and succeeds", async () => {
    const pool = new GeminiKeyPool(["k1", "k2"], { rpm: 10, rpd: 100, store });
    const usedKeys: string[] = [];
    const invoke: GeminiInvoke = async (key) => {
      usedKeys.push(key);
      if (key === "k1") throw rateLimit();
      return '{"ok": true}';
    };
    const result = await callGeminiJson(pool, { prompt: "hi" }, invoke);
    expect(result).toEqual({ ok: true });
    expect(usedKeys).toEqual(["k1", "k2"]);
    expect(await store.isCoolingDown("k1")).toBe(true);
  });

  it("propagates non-rate-limit errors without retrying", async () => {
    const pool = new GeminiKeyPool(["k1", "k2"], { rpm: 10, rpd: 100, store });
    let calls = 0;
    const invoke: GeminiInvoke = async () => {
      calls++;
      throw new Error("bad prompt");
    };
    await expect(callGeminiJson(pool, { prompt: "hi" }, invoke)).rejects.toThrow("bad prompt");
    expect(calls).toBe(1);
  });

  it("surfaces quota exhaustion when all keys are rate-limited", async () => {
    const pool = new GeminiKeyPool(["k1"], { rpm: 10, rpd: 100, store });
    const invoke: GeminiInvoke = async () => {
      throw rateLimit();
    };
    await expect(callGeminiJson(pool, { prompt: "hi" }, invoke)).rejects.toBeInstanceOf(
      GeminiQuotaExhaustedError,
    );
  });
});
