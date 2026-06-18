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
        name: { type: "string" },
        recipient_name: { type: "string" },
        issue_date: { type: "string" },
        expiry_date: { type: "string" },
        credential_id: { type: "string" },
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

const DIMENSION = {
  type: "object",
  properties: {
    score: { type: "integer" },
    reason: { type: "string" },
  },
  required: ["score", "reason"],
} as const;

export const EVAL_SCHEMA = {
  type: "object",
  properties: {
    dimensions: {
      type: "object",
      properties: {
        hard_skills: DIMENSION,
        experience_relevance: DIMENSION,
        seniority_scope: DIMENSION,
        education_certs: DIMENSION,
        domain_knowledge: DIMENSION,
      },
      required: [
        "hard_skills",
        "experience_relevance",
        "seniority_scope",
        "education_certs",
        "domain_knowledge",
      ],
    },
    strengths: { type: "array", items: { type: "string" } },
    gaps: { type: "array", items: { type: "string" } },
  },
  required: ["dimensions", "strengths", "gaps"],
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
  "This image was extracted from a resume and is likely a certificate.",
  "Classify it as certificate, profile_photo, logo, or other.",
  "If it is a certificate, extract every detail you can into `details`:",
  "issuer (organization), name (the credential/course title), recipient_name,",
  "issue_date, expiry_date, and credential_id. Omit fields that are not present.",
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

export function buildEvalPrompt(
  jobDescription: string,
  candidate: unknown,
  signals: unknown,
  maxBulletWords: number,
  maxBullets: number,
): string {
  return [
    "You are an expert technical recruiter scoring a candidate against a job description.",
    "Score EACH of these five dimensions from 0-100 and give a one-line reason:",
    "- hard_skills: overlap of required tools/languages/frameworks (exact or semantic).",
    "- experience_relevance: do past roles and responsibilities mirror the target role?",
    "- seniority_scope: does their level/scope match (individual contributor vs lead vs manager)?",
    "- education_certs: are minimum degree/certification requirements met?",
    "- domain_knowledge: experience in the relevant industry/domain.",
    "",
    `Then give the most important strengths and gaps as short bullets — at most ${maxBulletWords} words each, at most ${maxBullets} of each. Be specific and apt, not generic.`,
    "Do NOT output an overall score; only the five dimension scores. Judge only on the data provided.",
    "",
    "JOB DESCRIPTION:",
    jobDescription,
    "",
    "CANDIDATE (structured from the resume):",
    JSON.stringify(candidate, null, 2),
    "",
    "PRECOMPUTED SIGNALS (deterministic, for reference):",
    JSON.stringify(signals),
  ].join("\n");
}
