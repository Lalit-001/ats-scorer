/** Builds a ready-to-use Gemini caller (pool + Redis rate store + invoker). */
import type { Redis } from "ioredis";
import { config } from "../config.js";
import { GeminiKeyPool } from "./keyPool.js";
import { RedisRateStore } from "./redisRateStore.js";
import { callGeminiJson, createGeminiInvoke, type GeminiRequest } from "./geminiClient.js";

export type GeminiCaller = (req: GeminiRequest) => Promise<any>;

export function buildGeminiCaller(redis: Redis): GeminiCaller {
  if (config.gemini.keys.length === 0) {
    return async () => {
      throw new Error("No GEMINI_API_KEYS configured — set them in .env");
    };
  }
  const store = new RedisRateStore(redis);
  const pool = new GeminiKeyPool(config.gemini.keys, {
    rpm: config.gemini.rpm,
    rpd: config.gemini.rpd,
    store,
  });
  const invoke = createGeminiInvoke(config.gemini.model);
  return (req) => callGeminiJson(pool, req, invoke);
}
