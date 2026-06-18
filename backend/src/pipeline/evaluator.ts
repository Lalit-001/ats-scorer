/**
 * Step 2 of the AI layer: the main evaluation model. Combines the structured
 * sub-model output with the JD and returns a validated score + recommendation.
 */
import { z } from "zod";
import { buildEvalPrompt, EVAL_SCHEMA } from "../llm/prompts.js";
import { htmlToText } from "../llm/htmlToText.js";
import type { GeminiCaller } from "./submodels.js";

export const EvaluationResult = z.object({
  matchScore: z.number().int().min(0).max(100),
  recommendation: z.enum(["strong_match", "good_match", "reject"]),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
});
export type EvaluationResult = z.infer<typeof EvaluationResult>;

export async function evaluate(
  jobDescription: string,
  structured: unknown,
  call: GeminiCaller,
): Promise<EvaluationResult> {
  // The JD may be rich-text HTML; feed the evaluator clean plain text.
  const res = await call({
    prompt: buildEvalPrompt(htmlToText(jobDescription), structured),
    schema: EVAL_SCHEMA,
  });
  return EvaluationResult.parse(res);
}
