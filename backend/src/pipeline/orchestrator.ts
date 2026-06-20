/**
 * Pipeline orchestrator: drives an application through extract -> structure ->
 * certificates -> evaluate. Fail-fast: any stage error marks the application
 * `failed` (recording which stage broke) and stops; later stages do not run.
 *
 * The heavy lifting is deterministic (the parser's `structured` output). AI is
 * used only when needed: an LLM structuring fallback when parsing is weak, gated
 * vision for certificate images, and the single final evaluation.
 *
 * All side effects go through injected collaborators (`PipelineRepo`, `extract`,
 * `call`, `loadImage`) so the control flow is unit-testable without a DB or network.
 */
import { config } from "../config.js";
import { structureResume, classifyCertificates } from "./submodels.js";
import type { GeminiCaller, ImageLoader, RawImage, ClassifiedImage } from "./submodels.js";
import { candidateFromParser, candidateFromLlm } from "./candidate.js";
import type { Candidate, ExtractionResult } from "./candidate.js";
import { evaluate, type EvaluationResult } from "./evaluator.js";
import type { BasicDetails } from "../db/models/Application.js";

export type { ExtractionResult } from "./candidate.js";

export interface PipelineRepo {
  getApplication(id: string): Promise<{ resumePath: string; jobDescription: string }>;
  setStatus(id: string, status: string, opts?: { errorStage?: string; errorMessage?: string }): Promise<void>;
  saveBasicDetails(id: string, basicDetails: BasicDetails): Promise<void>;
  startRun(id: string, stage: Stage): Promise<void>;
  finishRun(id: string, stage: Stage, output: unknown): Promise<void>;
  failRun(id: string, stage: Stage, error: string): Promise<void>;
  saveExtractedImages(id: string, images: RawImage[]): Promise<void>;
  updateImageClassifications(id: string, classified: ClassifiedImage[]): Promise<void>;
  saveEvaluation(id: string, evaluation: EvaluationResult): Promise<void>;
}

export type Stage = "extract" | "structure" | "certificates" | "evaluate";

export interface ProcessDeps {
  repo: PipelineRepo;
  extract: (appId: string, resumePath: string) => Promise<ExtractionResult>;
  call: GeminiCaller;
  loadImage: ImageLoader;
}

class StageError extends Error {
  constructor(
    public readonly stage: Stage,
    public readonly cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "StageError";
  }
}

async function runStage<T>(repo: PipelineRepo, id: string, stage: Stage, fn: () => Promise<T>): Promise<T> {
  await repo.startRun(id, stage);
  try {
    const result = await fn();
    await repo.finishRun(id, stage, result);
    return result;
  } catch (err) {
    await repo.failRun(id, stage, err instanceof Error ? err.message : String(err));
    throw new StageError(stage, err);
  }
}

export async function processApplication(id: string, deps: ProcessDeps): Promise<void> {
  const { repo, extract, call, loadImage } = deps;
  const app = await repo.getApplication(id);

  try {
    await repo.setStatus(id, "processing");

    const raw = await runStage(repo, id, "extract", () => extract(id, app.resumePath));
    // Persist the cheap, LLM-free basics + images BEFORE any Gemini call, so a
    // later stage failure still leaves the dashboard with usable details.
    await repo.saveBasicDetails(id, raw.basic_details);
    await repo.saveExtractedImages(id, raw.pipeline_b.images);

    // STRUCTURE: trust the parser's deterministic output; only fall back to the
    // LLM when parsing came out weak (messy/unusual layout).
    const candidate: Candidate = await runStage(repo, id, "structure", async () => {

      if (raw.parse_quality.status === "good") {
        return candidateFromParser(raw.structured, raw.links);
      }
      const llmResume = await structureResume(raw.pipeline_a, call);
      return candidateFromLlm(llmResume, raw.links);
    });

    // CERTIFICATES: gated + capped vision. Icons/logos are skipped (their category
    // already comes from the link domain); only certificate-like images reach the LLM.
    const certImages = raw.pipeline_b.images
      .filter((img) => img.likely_certificate)
      .slice(0, config.maxVisionImages);
    const certs = await runStage(repo, id, "certificates", () =>
      classifyCertificates(certImages, call, loadImage),
    );
    await repo.updateImageClassifications(id, certs);

    // EVALUATE: the single guaranteed LLM call, over the compact candidate JSON.
    const evaluation = await runStage(repo, id, "evaluate", () =>
      evaluate(app.jobDescription, candidate, call),
    );
    await repo.saveEvaluation(id, evaluation);

    await repo.setStatus(id, "completed");
  } catch (err) {
    const stage = err instanceof StageError ? err.stage : "unknown";
    const message = err instanceof Error ? err.message : String(err);
    await repo.setStatus(id, "failed", { errorStage: stage, errorMessage: message });
    throw err;
  }
}
