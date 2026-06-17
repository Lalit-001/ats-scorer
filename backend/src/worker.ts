/** Worker entrypoint: consumes the queue and runs the fail-fast pipeline. */
import { Worker } from "bullmq";
import { config } from "./config.js";
import { APPLICATION_QUEUE, bullConnection, redisClient, type ApplicationJob } from "./queue/queue.js";
import { processApplication } from "./pipeline/orchestrator.js";
import { SequelizePipelineRepo } from "./pipeline/repo.js";
import { extractViaParser } from "./pipeline/parserClient.js";
import { loadImageFromDisk } from "./pipeline/imageLoader.js";
import { buildGeminiCaller } from "./llm/factory.js";
import { initDb } from "./db/models/index.js";

// API owns schema sync; the worker just needs a live connection.
await initDb({ sync: false });

const repo = new SequelizePipelineRepo();
const call = buildGeminiCaller(redisClient);

const worker = new Worker<ApplicationJob>(
  APPLICATION_QUEUE,
  async (job) => {
    const { applicationId } = job.data;
    await processApplication(applicationId, {
      repo,
      extract: extractViaParser,
      call,
      loadImage: loadImageFromDisk,
    });
  },
  // Small concurrency keeps us within Gemini free-tier RPM; the key pool adds headroom.
  { connection: bullConnection, concurrency: 2 },
);

worker.on("completed", (job) => console.log(`[worker] application ${job.data.applicationId} completed`));
worker.on("failed", (job, err) =>
  console.error(`[worker] application ${job?.data.applicationId} failed: ${err.message}`),
);

console.log(`[worker] listening on "${APPLICATION_QUEUE}" with model ${config.gemini.model}`);
