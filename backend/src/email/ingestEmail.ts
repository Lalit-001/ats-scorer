/**
 * Core email-ingestion logic, decoupled from HTTP.
 *
 * Turns one received Mailpit message into exactly one Application row, mirroring
 * the web apply flow (save PDF -> create Application -> enqueue) but with two
 * differences dictated by the channel:
 *   1. The job is resolved from a UUID the candidate writes in the email body
 *      (not from a URL slug). No/unknown UUID -> the application is an "orphan".
 *   2. Nothing is ever surfaced to the sender. Problems (missing attachment,
 *      unmatched job) are recorded on the row instead of returned as errors.
 *
 * Outcome matrix (every email leaves exactly one row, except duplicates):
 *   job ok + pdf ok  -> status "uploaded", enqueue (normal pipeline)
 *   job ok + no pdf  -> status "failed",  errorMessage set, not enqueued
 *   no job + pdf ok  -> status "orphan",  jobId null,      not enqueued
 *   no job + no pdf  -> status "orphan",  errorMessage set, not enqueued
 */
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Op, fn, col, where, UniqueConstraintError } from "sequelize";
import { JobDescription, Application } from "../db/models/index.js";
import type { ApplicationStatus } from "../db/models/Application.js";
import { config } from "../config.js";
import { enqueueApplication } from "../queue/queue.js";
import { getMessage, getAttachment, type MailpitAttachment } from "./mailpitClient.js";

const resumeDir = join(config.dataDir, "resumes");

// Matches a standard UUID (v1-v5); the first one in the email body is the job id.
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

export interface IngestResult {
  applicationId: string | null;
  status: ApplicationStatus | "duplicate";
}

const isPdf = (a: MailpitAttachment): boolean =>
  a.ContentType?.toLowerCase().includes("application/pdf") ||
  a.FileName?.toLowerCase().endsWith(".pdf") ||
  false;

/**
 * Ingest a single Mailpit message by its ID. Returns what happened so the caller
 * can log it. Throws only on unexpected failures (e.g. DB down) — the caller is
 * expected to swallow those and still ack the webhook.
 */
export async function ingestEmailMessage(messageId: string): Promise<IngestResult> {
  // 1. Pull the full message (body text + attachment metadata).
  const msg = await getMessage(messageId);

  // 2. Candidate identity from the From header (name falls back to the local-part).
  const fromAddress = msg.From?.Address?.trim() ?? "";
  const email = fromAddress || "unknown@unknown";
  const name = msg.From?.Name?.trim() || fromAddress.split("@")[0] || "Unknown";

  // 3. Resolve the job from the first UUID found in the body. Unknown id -> orphan.
  const uuid = (msg.Text ?? "").match(UUID_RE)?.[0] ?? null;
  const job = uuid ? await JobDescription.findByPk(uuid) : null;

  // 4. Find + download the PDF attachment, if any.
  const pdfPart = msg.Attachments?.find(isPdf) ?? null;
  let resumePath: string | null = null;
  let errorStage: string | null = null;
  let errorMessage: string | null = null;

  if (pdfPart) {
    try {
      const bytes = await getAttachment(messageId, pdfPart.PartID);
      await mkdir(resumeDir, { recursive: true });
      resumePath = join(resumeDir, `${randomUUID()}.pdf`);
      await writeFile(resumePath, bytes);
    } catch (err) {
      resumePath = null;
      errorStage = "intake";
      errorMessage = `Failed to download PDF attachment: ${(err as Error).message}`;
    }
  } else {
    errorStage = "intake";
    errorMessage = "No PDF attachment found in email";
  }

  // 5. Decide status. No job always wins as "orphan" (awaits later assignment);
  //    otherwise a usable PDF means we can process, a missing one means "failed".
  const hasPdf = resumePath !== null;
  const status: ApplicationStatus = !job ? "orphan" : hasPdf ? "uploaded" : "failed";

  // 6. Duplicate guard — only for job-bound applications (orphans never dedupe,
  //    matching the unique index on (jobId, lower(email)) which ignores null jobId).
  if (job) {
    const duplicate = await Application.findOne({
      where: { jobId: job.id, [Op.and]: [where(fn("lower", col("email")), email.toLowerCase())] },
    });
    if (duplicate) return { applicationId: duplicate.id, status: "duplicate" };
  }

  // 7. Create the row (every email leaves a trace) and enqueue when processable.
  try {
    const application = await Application.create({
      jobId: job?.id ?? null,
      name,
      email,
      resumePath,
      source: "email",
      status,
      errorStage,
      errorMessage,
    });
    if (status === "uploaded") await enqueueApplication(application.id);
    return { applicationId: application.id, status };
  } catch (err) {
    // Lost the race against a concurrent submit (web or email) — the unique index caught it.
    if (err instanceof UniqueConstraintError) return { applicationId: null, status: "duplicate" };
    throw err;
  }
}
