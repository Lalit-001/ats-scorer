"""Rotating pool of Gemini API keys for free-tier quota stretching (port of keyPool.ts
+ redisRateStore.ts).

Each key has per-minute (RPM) and per-day (RPD) budgets tracked in a RateStore
(Redis). acquire() hands out the next key under budget and not cooling down; on a
429 the caller calls penalize() to cool that key down and retries with the next.

NOTE: runs against Redis logical DB 1 (settings.redis_db) so it does NOT share the
Gemini usage counters with the Node stack on DB 0. While both stacks process live
traffic, their per-key budgets are tracked separately and could collectively exceed
the real quota — route live traffic to one stack at a time.
"""

from __future__ import annotations

from typing import Protocol

RPM_WINDOW_SECONDS = 60
RPD_WINDOW_SECONDS = 60 * 60 * 24
DEFAULT_COOLDOWN_SECONDS = 60


class RateStore(Protocol):
    async def count(self, key: str, window_seconds: int) -> int: ...
    async def hit(self, key: str, window_seconds: int) -> None: ...
    async def cooldown(self, key: str, seconds: int) -> None: ...
    async def is_cooling_down(self, key: str) -> bool: ...


class GeminiQuotaExhaustedError(Exception):
    def __init__(self) -> None:
        super().__init__("All Gemini API keys are rate-limited or over quota")


class RedisRateStore:
    """Redis-backed RateStore: counters auto-expire via TTL, cooldowns via short keys."""

    def __init__(self, redis) -> None:
        self.redis = redis

    async def count(self, key: str, _window_seconds: int) -> int:
        value = await self.redis.get(f"gkey:{key}")
        return int(value) if value else 0

    async def hit(self, key: str, window_seconds: int) -> None:
        redis_key = f"gkey:{key}"
        nxt = await self.redis.incr(redis_key)
        if nxt == 1:
            await self.redis.expire(redis_key, window_seconds)

    async def cooldown(self, key: str, seconds: int) -> None:
        await self.redis.set(f"gcool:{key}", "1", ex=seconds)

    async def is_cooling_down(self, key: str) -> bool:
        return (await self.redis.exists(f"gcool:{key}")) == 1


class GeminiKeyPool:
    def __init__(self, keys: list[str], rpm: int, rpd: int, store: RateStore) -> None:
        if not keys:
            raise ValueError("GeminiKeyPool requires at least one API key")
        self._keys = keys
        self._rpm = rpm
        self._rpd = rpd
        self._store = store
        self._cursor = 0

    async def acquire(self) -> str:
        n = len(self._keys)
        for offset in range(n):
            key = self._keys[(self._cursor + offset) % n]

            if await self._store.is_cooling_down(key):
                continue

            rpm = await self._store.count(f"rpm:{key}", RPM_WINDOW_SECONDS)
            rpd = await self._store.count(f"rpd:{key}", RPD_WINDOW_SECONDS)
            if rpm >= self._rpm or rpd >= self._rpd:
                continue

            await self._store.hit(f"rpm:{key}", RPM_WINDOW_SECONDS)
            await self._store.hit(f"rpd:{key}", RPD_WINDOW_SECONDS)
            self._cursor = (self._cursor + offset + 1) % n
            return key

        raise GeminiQuotaExhaustedError()

    async def penalize(self, key: str, seconds: int = DEFAULT_COOLDOWN_SECONDS) -> None:
        await self._store.cooldown(key, seconds)
