/**
 * Minimal client for Mailpit's REST API.
 *
 * Mailpit's webhook payload is only a message *summary* (it carries the message
 * ID and a From header, but not the body or attachment bytes). So ingestion
 * calls back here to fetch the full message and download the PDF part.
 * API reference: http://<mailpit>/api/v1/
 */
import { config } from "../config.js";

export interface MailpitAddress {
  Name: string;
  Address: string;
}

export interface MailpitAttachment {
  PartID: string;
  FileName: string;
  ContentType: string;
  ContentID: string;
  Size: number;
}

/** Shape of GET /api/v1/message/{ID} (only the fields we use). */
export interface MailpitMessage {
  ID: string;
  MessageID: string;
  From: MailpitAddress | null;
  To: MailpitAddress[];
  Subject: string;
  Text: string;
  HTML: string;
  Attachments: MailpitAttachment[];
}

/** GET /api/v1/message/{ID} — full message incl. body text + attachment list. */
export async function getMessage(id: string): Promise<MailpitMessage> {
  const res = await fetch(`${config.mailpit.apiUrl}/api/v1/message/${encodeURIComponent(id)}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Mailpit GET message ${id} failed (${res.status}): ${body}`);
  }
  return (await res.json()) as MailpitMessage;
}

/** GET /api/v1/message/{ID}/part/{PartID} — raw bytes of a single attachment. */
export async function getAttachment(id: string, partId: string): Promise<Buffer> {
  const res = await fetch(
    `${config.mailpit.apiUrl}/api/v1/message/${encodeURIComponent(id)}/part/${encodeURIComponent(partId)}`,
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Mailpit GET part ${partId} failed (${res.status}): ${body}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
