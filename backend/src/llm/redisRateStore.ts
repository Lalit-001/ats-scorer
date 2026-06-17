import type { Redis } from "ioredis";
import type { RateStore } from "./keyPool.js";

/** Redis-backed RateStore: counters auto-expire via TTL, cooldowns via short-lived keys. */
export class RedisRateStore implements RateStore {
  constructor(private readonly redis: Redis) {}

  async count(key: string, _windowSeconds: number): Promise<number> {
    const value = await this.redis.get(`gkey:${key}`);
    return value ? parseInt(value, 10) : 0;
  }

  async hit(key: string, windowSeconds: number): Promise<void> {
    const redisKey = `gkey:${key}`;
    const next = await this.redis.incr(redisKey);
    if (next === 1) {
      await this.redis.expire(redisKey, windowSeconds);
    }
  }

  async cooldown(key: string, seconds: number): Promise<void> {
    await this.redis.set(`gcool:${key}`, "1", "EX", seconds);
  }

  async isCoolingDown(key: string): Promise<boolean> {
    return (await this.redis.exists(`gcool:${key}`)) === 1;
  }
}
