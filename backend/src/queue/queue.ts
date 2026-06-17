/** BullMQ queue shared by the API (producer) and worker (consumer). */
import { Queue, type ConnectionOptions } from "bullmq";
import IORedis from "ioredis";
import { config } from "../config.js";

export const APPLICATION_QUEUE = "application-processing";

// Give BullMQ connection *options* (not a shared instance) so it manages its own
// client — this sidesteps the ioredis version clash from BullMQ's bundled copy.
const url = new URL(config.redisUrl);
export const bullConnection: ConnectionOptions = {
  host: url.hostname,
  port: Number(url.port || 6379),
  maxRetriesPerRequest: null,
};

// Separate plain client used only for the Gemini key-usage counters.
export const redisClient = new IORedis(config.redisUrl);

export const applicationQueue = new Queue(APPLICATION_QUEUE, { connection: bullConnection });

export interface ApplicationJob {
  applicationId: string;
}

export async function enqueueApplication(applicationId: string): Promise<void> {
  // attempts: 1 — fail-fast. Recovery is an explicit admin "re-process", not an auto-retry.
  await applicationQueue.add(
    "process",
    { applicationId } satisfies ApplicationJob,
    { attempts: 1, removeOnComplete: true, removeOnFail: false },
  );
}
