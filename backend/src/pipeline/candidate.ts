/**
 * The unified, compact candidate shape fed to the evaluator and stored as the
 * `structure` stage output. Both the deterministic parser path and the LLM
 * fallback converge here, so downstream code sees one shape.
 */
import type { BasicDetails } from "../db/models/Application.js";

export interface CategorizedLink {
  category: string;
  url: string;
  source: string;
}

export interface ParserImage {
  index: number;
  page: number;
  path: string;
  bbox: number[];
  width?: number;
  height?: number;
  is_icon?: boolean;
  likely_certificate?: boolean;
}

export interface ParserStructured {
  name: string | null;
  sections: Record<string, string>;
  skills: string[];
  experience: { text: string; total_years: number };
  education: string[];
  certifications: string[];
}

export interface ExtractionResult {
  pipeline_a: { text: string; links: { uri: string }[] };
  pipeline_b: { images: ParserImage[] };
  pipeline_c: { icon_links: { uri: string; matched_image_index: number }[] };
  basic_details: BasicDetails;
  structured: ParserStructured;
  links: CategorizedLink[];
  parse_quality: {
    status: "good" | "weak";
    sections_found: number;
    skills_found: number;
    text_len: number;
  };
}

export interface Candidate {
  name: string | null;
  skills: string[];
  experienceYears: number | null;
  experienceText: string;
  education: string[];
  certifications: string[];
  links: CategorizedLink[];
  source: "parser" | "llm";
}

const MAX_EXPERIENCE_CHARS = 4000;

/** Build the candidate from the parser's deterministic structuring. */
export function candidateFromParser(
  structured: ParserStructured,
  links: CategorizedLink[],
): Candidate {
  const experienceText = [
    structured.sections?.summary,
    structured.experience?.text,
    structured.sections?.projects,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, MAX_EXPERIENCE_CHARS);

  return {
    name: structured.name,
    skills: structured.skills ?? [],
    experienceYears: structured.experience?.total_years ?? null,
    experienceText,
    education: structured.education ?? [],
    certifications: structured.certifications ?? [],
    links,
    source: "parser",
  };
}

/** Build the candidate from the LLM structuring fallback (RESUME_SCHEMA shape). */
export function candidateFromLlm(llmResume: any, links: CategorizedLink[]): Candidate {
  const experience = Array.isArray(llmResume?.experience) ? llmResume.experience : [];
  const education = Array.isArray(llmResume?.education) ? llmResume.education : [];

  const experienceText = experience
    .map((e: any) => {
      const head = [e.role, e.company].filter(Boolean).join(" at ");
      const dur = e.duration ? ` (${e.duration})` : "";
      const highlights = Array.isArray(e.highlights) ? e.highlights.join("; ") : "";
      return `${head}${dur}${highlights ? ": " + highlights : ""}`.trim();
    })
    .filter(Boolean)
    .join("\n")
    .slice(0, MAX_EXPERIENCE_CHARS);

  return {
    name: llmResume?.contact?.name ?? null,
    skills: Array.isArray(llmResume?.skills) ? llmResume.skills : [],
    experienceYears: null,
    experienceText,
    education: education
      .map((e: any) => [e.degree, e.institution, e.year].filter(Boolean).join(", "))
      .filter(Boolean),
    certifications: [],
    links,
    source: "llm",
  };
}
