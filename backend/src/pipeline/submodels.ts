/**
 * Step 1 of the AI layer: three sub-models that turn each pipeline's raw output
 * into structured JSON. Each takes an injected `call` (Gemini) so it is testable.
 */
import type { GeminiRequest } from "../llm/geminiClient.js";
import {
  buildResumePrompt,
  RESUME_SCHEMA,
  IMAGE_PROMPT,
  IMAGE_SCHEMA,
  buildLinksPrompt,
  LINKS_SCHEMA,
} from "../llm/prompts.js";

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

/** Sub-model A: raw text + explicit links -> structured resume JSON. */
export async function structureResume(
  pipelineA: { text: string; links: unknown[] },
  call: GeminiCaller,
): Promise<any> {
  return call({ prompt: buildResumePrompt(pipelineA), schema: RESUME_SCHEMA });
}

/** Sub-model B: classify each extracted image, extracting certificate details. */
export async function classifyImages(
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

/** Sub-model C: icon-embedded hyperlinks -> categorized links JSON. */
export async function structureLinks(
  pipelineC: { icon_links: unknown[] },
  call: GeminiCaller,
): Promise<any> {
  return call({ prompt: buildLinksPrompt(pipelineC), schema: LINKS_SCHEMA });
}
