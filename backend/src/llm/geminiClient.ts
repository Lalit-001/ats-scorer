/**
 * Thin wrapper that runs a Gemini call through the key pool with 429 failover.
 *
 * The network call is injected (`GeminiInvoke`) so the retry logic is testable
 * without the real SDK. `createGeminiInvoke` provides the production invoker.
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GeminiKeyPool } from "./keyPool.js";

export interface GeminiImage {
  mimeType: string;
  /** Raw bytes or a base64 string. */
  data: Buffer | string;
}

export interface GeminiRequest {
  prompt: string;
  schema?: object;
  images?: GeminiImage[];
}

/** Returns the model's raw text response (expected to be JSON). */
export type GeminiInvoke = (key: string, req: GeminiRequest) => Promise<string>;

function isRateLimit(err: unknown): boolean {
  if (!err) return false;
  const status = (err as { status?: number }).status;
  if (status === 429) return true;
  const msg = String((err as { message?: string }).message ?? err);
  return /\b429\b|RESOURCE_EXHAUSTED|rate.?limit|quota/i.test(msg);
}

export async function callGeminiJson(
  pool: GeminiKeyPool,
  req: GeminiRequest,
  invoke: GeminiInvoke,
  opts: { maxAttempts?: number } = {},
): Promise<unknown> {
  const maxAttempts = opts.maxAttempts ?? 5;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const key = await pool.acquire(); // throws GeminiQuotaExhaustedError when nothing is available
    try {
      const text = await invoke(key, req);
      return JSON.parse(text);
    } catch (err) {
      if (isRateLimit(err)) {
        await pool.penalize(key);
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  throw lastError ?? new Error("Gemini call failed after retries");
}

export function createGeminiInvoke(model: string): GeminiInvoke {
  return async (key, req) => {
    const genAI = new GoogleGenerativeAI(key);
    const generativeModel = genAI.getGenerativeModel({
      model,
      generationConfig: {
        responseMimeType: "application/json",
        ...(req.schema ? { responseSchema: req.schema as never } : {}),
      },
    });

    const parts: unknown[] = [{ text: req.prompt }];
    for (const img of req.images ?? []) {
      parts.push({
        inlineData: {
          mimeType: img.mimeType,
          data: typeof img.data === "string" ? img.data : img.data.toString("base64"),
        },
      });
    }

    const result = await generativeModel.generateContent(parts as never);
    return result.response.text();
  };
}
