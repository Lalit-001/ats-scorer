/**
 * Final evaluation. The LLM scores five rubric dimensions (0-100) and returns
 * concise strengths/gaps; WE compute the weighted overall score and the
 * recommendation here so they stay consistent with the displayed breakdown.
 */
import { z } from "zod";
import { config } from "../config.js";
import { buildEvalPrompt, EVAL_SCHEMA } from "../llm/prompts.js";
import { htmlToText } from "../llm/htmlToText.js";
import type { GeminiCaller } from "./submodels.js";
import type { Candidate } from "./candidate.js";

const DimensionScore = z.object({
  score: z.number().int().min(0).max(100),
  reason: z.string(),
});

const EvaluationLlm = z.object({
  dimensions: z.object({
    hard_skills: DimensionScore,
    experience_relevance: DimensionScore,
    seniority_scope: DimensionScore,
    education_certs: DimensionScore,
    domain_knowledge: DimensionScore,
  }),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
});

export type DimensionKey = keyof z.infer<typeof EvaluationLlm>["dimensions"];

export interface EvaluationResult {
  matchScore: number;
  recommendation: "strong_match" | "good_match" | "reject";
  dimensions: Record<DimensionKey, { score: number; weight: number; reason: string }>;
  strengths: string[];
  gaps: string[];
}

/** Trim each bullet to the word cap and limit how many we keep. */
function trimBullets(items: string[]): string[] {
  const { maxBullets, maxBulletWords } = config.rubric;
  return items
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, maxBullets)
    .map((s) => {
      const words = s.split(/\s+/);
      return words.length <= maxBulletWords ? s : words.slice(0, maxBulletWords).join(" ") + "…";
    });
}

/** Cheap deterministic signals to ground the LLM's hard-skills judgement. */
function computeSignals(jdText: string, candidate: Candidate) {
  const jd = jdText.toLowerCase();
  const matchedSkills = candidate.skills.filter((s) => jd.includes(s.toLowerCase()));
  return {
    matchedSkills,
    skillMatchCount: matchedSkills.length,
    totalSkills: candidate.skills.length,
    experienceYears: candidate.experienceYears,
  };
}

/** Compact candidate view sent to the model (drops bulky link metadata). */
function candidateForPrompt(candidate: Candidate) {
  return {
    name: candidate.name,
    skills: candidate.skills,
    experienceYears: candidate.experienceYears,
    experience: candidate.experienceText,
    education: candidate.education,
    certifications: candidate.certifications,
    linkCategories: [...new Set(candidate.links.map((l) => l.category))],
  };
}

function finalize(parsed: z.infer<typeof EvaluationLlm>): EvaluationResult {
  const { weights, thresholds } = config.rubric;
  const dimensions = {} as EvaluationResult["dimensions"];
  let total = 0;
  for (const key of Object.keys(weights) as DimensionKey[]) {
    const weight = weights[key];
    const { score, reason } = parsed.dimensions[key];
    dimensions[key] = { score, weight, reason };
    total += score * weight;
  }
  const matchScore = Math.round(total);
  const recommendation =
    matchScore >= thresholds.strong
      ? "strong_match"
      : matchScore >= thresholds.good
        ? "good_match"
        : "reject";

  return {
    matchScore,
    recommendation,
    dimensions,
    strengths: trimBullets(parsed.strengths),
    gaps: trimBullets(parsed.gaps),
  };
}

export async function evaluate(
  jobDescription: string,
  candidate: Candidate,
  call: GeminiCaller,
): Promise<EvaluationResult> {
  // The JD may be rich-text HTML; feed the evaluator clean plain text.
  const jdText = htmlToText(jobDescription);
  const signals = computeSignals(jdText, candidate);
  const res = await call({
    prompt: buildEvalPrompt(
      jdText,
      candidateForPrompt(candidate),
      signals,
      config.rubric.maxBulletWords,
      config.rubric.maxBullets,
    ),
    schema: EVAL_SCHEMA,
  });
  return finalize(EvaluationLlm.parse(res));
}
