/** Sequelize-backed implementation of the orchestrator's PipelineRepo. */
import {
  Application,
  PipelineRun,
  ExtractedImage,
  Evaluation,
  JobDescription,
} from "../db/models/index.js";
import type { ApplicationStatus, BasicDetails } from "../db/models/Application.js";
import type { ImageType } from "../db/models/ExtractedImage.js";
import type { Recommendation } from "../db/models/Evaluation.js";
import type { PipelineRepo, Stage } from "./orchestrator.js";
import type { RawImage, ClassifiedImage } from "./submodels.js";
import type { EvaluationResult } from "./evaluator.js";

export class SequelizePipelineRepo implements PipelineRepo {
  async getApplication(id: string): Promise<{ resumePath: string; jobDescription: string }> {
    const app = await Application.findByPk(id, {
      include: [{ model: JobDescription, as: "job" }],
    });
    if (!app || !app.job) throw new Error(`Application ${id} not found`);
    return { resumePath: app.resumePath, jobDescription: app.job.description };
  }

  async setStatus(
    id: string,
    status: string,
    opts?: { errorStage?: string; errorMessage?: string },
  ): Promise<void> {
    await Application.update(
      {
        status: status as ApplicationStatus,
        errorStage: opts?.errorStage ?? null,
        errorMessage: opts?.errorMessage ?? null,
      },
      { where: { id } },
    );
  }

  async saveBasicDetails(id: string, basicDetails: BasicDetails): Promise<void> {
    await Application.update({ basicDetails }, { where: { id } });
  }

  async startRun(id: string, stage: Stage): Promise<void> {
    await PipelineRun.destroy({ where: { applicationId: id, stage } });
    await PipelineRun.create({ applicationId: id, stage, status: "running", startedAt: new Date() });
  }

  async finishRun(id: string, stage: Stage, output: unknown): Promise<void> {
    // `extract` is raw PDF data; the other stages are LLM-structured JSON.
    const data =
      stage === "extract"
        ? { status: "done" as const, finishedAt: new Date(), rawOutput: output ?? {} }
        : { status: "done" as const, finishedAt: new Date(), structuredOutput: output ?? {} };
    await PipelineRun.update(data, { where: { applicationId: id, stage } });
  }

  async failRun(id: string, stage: Stage, error: string): Promise<void> {
    await PipelineRun.update(
      { status: "failed", finishedAt: new Date(), error },
      { where: { applicationId: id, stage } },
    );
  }

  async saveExtractedImages(id: string, images: RawImage[]): Promise<void> {
    if (images.length === 0) return;
    await ExtractedImage.bulkCreate(
      images.map((img) => ({ applicationId: id, imageIndex: img.index, imagePath: img.path })),
    );
  }

  async updateImageClassifications(id: string, classified: ClassifiedImage[]): Promise<void> {
    for (const c of classified) {
      await ExtractedImage.update(
        {
          imageType: c.imageType as ImageType,
          details: (c.details as Record<string, unknown> | null) ?? null,
        },
        { where: { applicationId: id, imageIndex: c.index } },
      );
    }
  }

  async saveEvaluation(id: string, evaluation: EvaluationResult): Promise<void> {
    await Evaluation.create({
      applicationId: id,
      matchScore: evaluation.matchScore,
      recommendation: evaluation.recommendation as Recommendation,
      strengths: evaluation.strengths,
      gaps: evaluation.gaps,
      rawLlmJson: evaluation,
    });
  }
}
