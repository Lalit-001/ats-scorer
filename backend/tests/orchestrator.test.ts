import { describe, it, expect, beforeEach } from "vitest";
import {
  processApplication,
  type PipelineRepo,
  type ExtractionResult,
} from "../src/pipeline/orchestrator.js";
import type { GeminiRequest } from "../src/llm/geminiClient.js";

function fakeExtraction(): ExtractionResult {
  return {
    pipeline_a: { text: "Jane Developer, React", links: [] },
    pipeline_b: { images: [{ index: 0, path: "/img/0.png" }] },
    pipeline_c: { icon_links: [] },
  };
}

class FakeRepo implements PipelineRepo {
  statusCalls: any[] = [];
  runs: any[] = [];
  saved: any = { images: null, classifications: null, evaluation: null };
  app = { id: "a1", resumePath: "/r.pdf", jobDescription: "JD: React dev" };

  async getApplication() {
    return this.app;
  }
  async setStatus(_id: string, status: string, opts?: any) {
    this.statusCalls.push({ status, ...opts });
  }
  async startRun(_id: string, stage: string) {
    this.runs.push({ stage, status: "running" });
  }
  async finishRun(_id: string, stage: string) {
    this.runs.push({ stage, status: "done" });
  }
  async failRun(_id: string, stage: string, error: string) {
    this.runs.push({ stage, status: "failed", error });
  }
  async saveExtractedImages(_id: string, images: any) {
    this.saved.images = images;
  }
  async updateImageClassifications(_id: string, c: any) {
    this.saved.classifications = c;
  }
  async saveEvaluation(_id: string, e: any) {
    this.saved.evaluation = e;
  }
}

const loadImage = async () => ({ mimeType: "image/png", data: Buffer.from("x") });

function makeCall(overrides: { failOn?: string } = {}) {
  let count = 0;
  const call = async (req: GeminiRequest) => {
    count++;
    const p = req.prompt;
    if (overrides.failOn && p.includes(overrides.failOn)) {
      throw Object.assign(new Error("429 RESOURCE_EXHAUSTED"), { status: 429 });
    }
    if (p.includes("technical recruiter"))
      return { matchScore: 80, recommendation: "good_match", strengths: ["React"], gaps: [] };
    if (p.includes("resume parser")) return { contact: { name: "Jane" }, skills: ["React"] };
    if (p.includes("hidden behind clickable icons")) return { links: [] };
    if (p.includes("Classify it as one of"))
      return { imageType: "certificate", details: { issuer: "AWS" } };
    return {};
  };
  return { call, count: () => count };
}

describe("processApplication", () => {
  let repo: FakeRepo;
  beforeEach(() => {
    repo = new FakeRepo();
  });

  it("runs all stages and completes on the happy path", async () => {
    const { call } = makeCall();
    await processApplication("a1", { repo, extract: async () => fakeExtraction(), call, loadImage });

    expect(repo.statusCalls.map((s) => s.status)).toEqual(["processing", "completed"]);
    expect(repo.saved.evaluation.matchScore).toBe(80);
    const doneStages = repo.runs.filter((r) => r.status === "done").map((r) => r.stage);
    expect(doneStages).toEqual(["extract", "submodel_a", "submodel_b", "submodel_c", "main_eval"]);
  });

  it("fails fast when extraction throws and skips later stages", async () => {
    const { call, count } = makeCall();
    await expect(
      processApplication("a1", {
        repo,
        extract: async () => {
          throw new Error("parser unreachable");
        },
        call,
        loadImage,
      }),
    ).rejects.toThrow();

    const failed = repo.statusCalls.find((s) => s.status === "failed");
    expect(failed.errorStage).toBe("extract");
    expect(count()).toBe(0); // no LLM calls happened
    expect(repo.saved.evaluation).toBeNull();
  });

  it("fails fast at the image sub-model and never reaches evaluation", async () => {
    const { call } = makeCall({ failOn: "Classify it as one of" });
    await expect(
      processApplication("a1", { repo, extract: async () => fakeExtraction(), call, loadImage }),
    ).rejects.toThrow();

    const failed = repo.statusCalls.find((s) => s.status === "failed");
    expect(failed.errorStage).toBe("submodel_b");
    expect(repo.runs.some((r) => r.stage === "main_eval")).toBe(false);
    expect(repo.saved.evaluation).toBeNull();
  });
});
