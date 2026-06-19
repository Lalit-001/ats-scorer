/**
 * AI helpers used only when deterministic parsing isn't enough:
 *  - `structureResume`: LLM fallback that structures a resume from raw text
 *    (used only when the parser's `parse_quality` is weak).
 *  - `classifyCertificates`: vision classification of certificate-candidate
 *    images (gated + capped by the orchestrator; icons/logos never reach here).
 * Each takes an injected `call` (Gemini) so it stays testable.
 */
import type { GeminiRequest } from "../llm/geminiClient.js";
import { buildResumePrompt, RESUME_SCHEMA, IMAGE_PROMPT, IMAGE_SCHEMA } from "../llm/prompts.js";

export type GeminiCaller = (req: GeminiRequest) => Promise<any>;
export type ImageLoader = (path: string) => Promise<{ mimeType: string; data: Buffer }>;

export interface RawImage {
  index: number;
  path: string;
}

export interface ClassifiedImage {
  index: number;
  imageType: string;
  details: unknown;
}

/** Fallback: raw text + explicit links -> structured resume JSON (RESUME_SCHEMA). */
export async function structureResume(
  pipelineA: { text: string; links: unknown[] },
  call: GeminiCaller,
): Promise<any> {
  return call({ prompt: buildResumePrompt(pipelineA), schema: RESUME_SCHEMA });
}

/** Vision-classify certificate-candidate images and extract their details. */
export async function classifyCertificates(
  images: RawImage[],
  call: GeminiCaller,
  loadImage: ImageLoader,
): Promise<ClassifiedImage[]> {
  const out: ClassifiedImage[] = [];
  for (const img of images) {
    const { mimeType, data } = await loadImage(img.path);
    const res = await call({
      prompt: IMAGE_PROMPT,
      schema: IMAGE_SCHEMA,
      images: [{ mimeType, data }],
    });
    out.push({ index: img.index, imageType: res.imageType, details: res.details ?? null });
  }
  return out;
}
