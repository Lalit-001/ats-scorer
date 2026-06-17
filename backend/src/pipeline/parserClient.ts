/** HTTP client for the Python parser service: PDF on disk -> raw A/B/C extraction. */
import { readFile } from "node:fs/promises";
import { config } from "../config.js";
import type { ExtractionResult } from "./orchestrator.js";

export async function extractViaParser(appId: string, resumePath: string): Promise<ExtractionResult> {
  const bytes = await readFile(resumePath);

  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "application/pdf" }), "resume.pdf");
  form.append("app_id", appId);

  const res = await fetch(`${config.parserUrl}/extract`, { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Parser /extract failed (${res.status}): ${body}`);
  }
  return (await res.json()) as ExtractionResult;
}
