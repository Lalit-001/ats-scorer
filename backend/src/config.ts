/** Central env-driven configuration. */
export const config = {
  port: Number(process.env.API_PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? "",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  parserUrl: process.env.PARSER_URL ?? "http://localhost:8000",
  adminPassword: process.env.ADMIN_PASSWORD ?? "changeme",
  adminTokenSecret: process.env.ADMIN_TOKEN_SECRET ?? "dev-secret-change-me",
  dataDir: process.env.DATA_DIR ?? "/data",
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 10),
  // Cap on certificate vision calls per resume (the only per-image AI cost).
  maxVisionImages: Number(process.env.MAX_VISION_IMAGES ?? 2),
  gemini: {
    keys: (process.env.GEMINI_API_KEYS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    model: process.env.GEMINI_MODEL ?? "gemini-1.5-flash",
    rpm: Number(process.env.GEMINI_RPM ?? 10),
    rpd: Number(process.env.GEMINI_RPD ?? 250),
  },
} as const;
