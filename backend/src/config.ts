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
  // Inbound email ingestion via Mailpit (SMTP catcher + webhook).
  mailpit: {
    // REST API base used to fetch the full message + download attachments.
    apiUrl: process.env.MAILPIT_API_URL ?? "http://localhost:8025",
    // Shared secret Mailpit sends as the Basic-auth password on the webhook call.
    // Must match the password in MP_WEBHOOK_URL.
    webhookSecret: process.env.EMAIL_WEBHOOK_SECRET ?? "dev-email-secret-change-me",
  },
  // Cap on certificate vision calls per resume (the only per-image AI cost).
  maxVisionImages: Number(process.env.MAX_VISION_IMAGES ?? 2),
  // Weighted scoring rubric. The LLM returns per-dimension 0-100 sub-scores; we
  // compute the overall score and recommendation here so they stay consistent.
  rubric: {
    weights: {
      hard_skills: 0.35,
      experience_relevance: 0.3,
      seniority_scope: 0.15,
      education_certs: 0.1,
      domain_knowledge: 0.1,
    },
    thresholds: { strong: 75, good: 55 },
    maxBullets: 5,
    maxBulletWords: 20,
  },
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
