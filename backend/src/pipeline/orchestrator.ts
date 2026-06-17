/**
 * Pipeline orchestrator: drives an application through extract -> sub-models ->
 * main evaluation. Fail-fast: any stage error marks the application `failed`
 * (recording which stage broke) and stops; later stages do not run.
 *
 * All side effects go through injected collaborators (`PipelineRepo`, `extract`,
 * `call`, `loadImage`) so the control flow is unit-testable without a DB or network.
 */
import { structureResume, classifyImages, structureLinks } from "./submodels.js";
import type { GeminiCaller, ImageLoader, RawImage, ClassifiedImage } from "./submodels.js";
import { evaluate, type EvaluationResult } from "./evaluator.js";

export interface BasicDetails {
  name_guess: string | null;
  emails: string[];
  phones: string[];
  links: string[];
  text_preview: string;
}

export interface ExtractionResult {
  pipeline_a: { text: string; links: unknown[] };
  pipeline_b: { images: RawImage[] };
  pipeline_c: { icon_links: unknown[] };
  basic_details: BasicDetails;
}

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

export type Stage = "extract" | "submodel_a" | "submodel_b" | "submodel_c" | "main_eval";

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

    const resume = await runStage(repo, id, "submodel_a", () => structureResume(raw.pipeline_a, call));
    const images = await runStage(repo, id, "submodel_b", () =>
      classifyImages(raw.pipeline_b.images, call, loadImage),
    );
    await repo.updateImageClassifications(id, images);
    const links = await runStage(repo, id, "submodel_c", () => structureLinks(raw.pipeline_c, call));

    const structured = { resume, certificates: images, links };
    const evaluation = await runStage(repo, id, "main_eval", () =>
      evaluate(app.jobDescription, structured, call),
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
