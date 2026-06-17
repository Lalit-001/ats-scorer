/** BullMQ queue shared by the API (producer) and worker (consumer). */
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { config } from "../config.js";

export const APPLICATION_QUEUE = "application-processing";

export const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });

export const applicationQueue = new Queue(APPLICATION_QUEUE, { connection });

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
