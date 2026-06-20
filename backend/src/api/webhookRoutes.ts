/**
 * Internal webhook for inbound email. Mailpit POSTs a received-message *summary*
 * here (JSON, with the message `ID`); we hand it to the ingestion logic.
 *
 * This endpoint NEVER returns an error to the caller — Mailpit isn't the
 * candidate, and a non-2xx just makes it retry. We always ack with 200 and log
 * problems server-side.
 */
import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { config } from "../config.js";
import { ah } from "./asyncHandler.js";
import { ingestEmailMessage } from "../email/ingestEmail.js";

export const webhookRouter = Router();

/** Verify Mailpit's Basic-auth password against the shared secret. */
function authorized(header: string | undefined): boolean {
  if (!header?.startsWith("Basic ")) return false;
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const password = decoded.slice(decoded.indexOf(":") + 1);
  const a = Buffer.from(password);
  const b = Buffer.from(config.mailpit.webhookSecret);
  return a.length === b.length && timingSafeEqual(a, b);
}

webhookRouter.post(
  "/email",
  ah(async (req, res) => {

    console.log("web hook received from mailpit")
    if (!authorized(req.headers.authorization)) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const messageId = String(req.body?.ID ?? "").trim();
    if (!messageId) {
      res.status(200).json({ ok: true, skipped: "no-message-id" });
      return;
    }

    try {
      const result = await ingestEmailMessage(messageId);
      console.log(
        `[email] ingested message ${messageId} -> application ${result.applicationId ?? "—"} (${result.status})`,
      );
    } catch (err) {
      // Swallow: never surface ingestion errors; just log and ack.
      console.error(`[email] failed to ingest message ${messageId}:`, (err as Error).message);
    }

    // Always 2xx so Mailpit clears it from the webhook queue.
    res.status(200).json({ ok: true });
  }),
);
