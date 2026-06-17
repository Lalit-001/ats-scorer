/**
 * Prompt templates and Gemini response schemas for the four LLM calls:
 * three structuring sub-models (A/B/C) and the main evaluation.
 */

export const RESUME_SCHEMA = {
  type: "object",
  properties: {
    contact: {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        location: { type: "string" },
      },
    },
    skills: { type: "array", items: { type: "string" } },
    education: {
      type: "array",
      items: {
        type: "object",
        properties: {
          institution: { type: "string" },
          degree: { type: "string" },
          year: { type: "string" },
        },
      },
    },
    experience: {
      type: "array",
      items: {
        type: "object",
        properties: {
          company: { type: "string" },
          role: { type: "string" },
          duration: { type: "string" },
          highlights: { type: "array", items: { type: "string" } },
        },
      },
    },
    projects: { type: "array", items: { type: "string" } },
    links: { type: "array", items: { type: "string" } },
  },
} as const;

export const IMAGE_SCHEMA = {
  type: "object",
  properties: {
    imageType: { type: "string", enum: ["certificate", "profile_photo", "logo", "other"] },
    details: {
      type: "object",
      properties: {
        issuer: { type: "string" },
        date: { type: "string" },
        name: { type: "string" },
        title: { type: "string" },
      },
    },
  },
  required: ["imageType"],
} as const;

export const LINKS_SCHEMA = {
  type: "object",
  properties: {
    links: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: ["linkedin", "github", "portfolio", "twitter", "other"],
          },
          url: { type: "string" },
        },
        required: ["category", "url"],
      },
    },
  },
} as const;

export const EVAL_SCHEMA = {
  type: "object",
  properties: {
    matchScore: { type: "integer" },
    recommendation: { type: "string", enum: ["strong_match", "good_match", "reject"] },
    strengths: { type: "array", items: { type: "string" } },
    gaps: { type: "array", items: { type: "string" } },
  },
  required: ["matchScore", "recommendation", "strengths", "gaps"],
} as const;

export function buildResumePrompt(pipelineA: { text: string; links: unknown[] }): string {
  return [
    "You are a resume parser. Convert the raw resume text and links below into structured JSON",
    "matching the provided schema. Use empty strings/arrays for anything not present. Do not invent data.",
    "",
    "RAW TEXT:",
    pipelineA.text,
    "",
    "EXPLICIT LINKS:",
    JSON.stringify(pipelineA.links),
  ].join("\n");
}

export const IMAGE_PROMPT = [
  "Look at this image extracted from a resume PDF. Classify it as one of:",
  "certificate, profile_photo, logo, or other.",
  "If it is a certificate, extract issuer, date, and the recipient name into `details`.",
  "Respond as JSON matching the schema.",
].join("\n");

export function buildLinksPrompt(pipelineC: { icon_links: unknown[] }): string {
  return [
    "These hyperlinks were hidden behind clickable icons in a resume (e.g. a LinkedIn icon).",
    "Categorize each URL as linkedin, github, portfolio, twitter, or other. Respond as JSON.",
    "",
    "ICON LINKS:",
    JSON.stringify(pipelineC.icon_links),
  ].join("\n");
}

export function buildEvalPrompt(jobDescription: string, structured: unknown): string {
  return [
    "You are an expert technical recruiter. Evaluate the candidate against the job description.",
    "Return JSON with: matchScore (0-100 integer), recommendation (strong_match | good_match | reject),",
    "strengths (array), and gaps (array). Base your judgement only on the data provided.",
    "",
    "JOB DESCRIPTION:",
    jobDescription,
    "",
    "CANDIDATE (structured from resume text, images, and embedded links):",
    JSON.stringify(structured, null, 2),
  ].join("\n");
}
