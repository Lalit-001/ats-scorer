/** Prisma-backed implementation of the orchestrator's PipelineRepo. */
import { Prisma, type ApplicationStatus, type ImageType, type Recommendation } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import type { PipelineRepo, Stage } from "./orchestrator.js";
import type { RawImage, ClassifiedImage } from "./submodels.js";
import type { EvaluationResult } from "./evaluator.js";

export class PrismaPipelineRepo implements PipelineRepo {
  async getApplication(id: string): Promise<{ resumePath: string; jobDescription: string }> {
    const app = await prisma.application.findUniqueOrThrow({
      where: { id },
      include: { job: true },
    });
    return { resumePath: app.resumePath, jobDescription: app.job.description };
  }

  async setStatus(
    id: string,
    status: string,
    opts?: { errorStage?: string; errorMessage?: string },
  ): Promise<void> {
    await prisma.application.update({
      where: { id },
      data: {
        status: status as ApplicationStatus,
        errorStage: opts?.errorStage ?? null,
        errorMessage: opts?.errorMessage ?? null,
      },
    });
  }

  async startRun(id: string, stage: Stage): Promise<void> {
    await prisma.pipelineRun.deleteMany({ where: { applicationId: id, stage } });
    await prisma.pipelineRun.create({
      data: { applicationId: id, stage, status: "running", startedAt: new Date() },
    });
  }

  async finishRun(id: string, stage: Stage, output: unknown): Promise<void> {
    const field = stage === "extract" ? "rawOutput" : "structuredOutput";
    await prisma.pipelineRun.updateMany({
      where: { applicationId: id, stage },
      data: {
        status: "done",
        finishedAt: new Date(),
        [field]: (output ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  async failRun(id: string, stage: Stage, error: string): Promise<void> {
    await prisma.pipelineRun.updateMany({
      where: { applicationId: id, stage },
      data: { status: "failed", finishedAt: new Date(), error },
    });
  }

  async saveExtractedImages(id: string, images: RawImage[]): Promise<void> {
    if (images.length === 0) return;
    await prisma.extractedImage.createMany({
      data: images.map((img) => ({
        applicationId: id,
        imageIndex: img.index,
        imagePath: img.path,
      })),
    });
  }

  async updateImageClassifications(id: string, classified: ClassifiedImage[]): Promise<void> {
    for (const c of classified) {
      await prisma.extractedImage.updateMany({
        where: { applicationId: id, imageIndex: c.index },
        data: {
          imageType: c.imageType as ImageType,
          details: (c.details ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        },
      });
    }
  }

  async saveEvaluation(id: string, evaluation: EvaluationResult): Promise<void> {
    await prisma.evaluation.create({
      data: {
        applicationId: id,
        matchScore: evaluation.matchScore,
        recommendation: evaluation.recommendation as Recommendation,
        strengths: evaluation.strengths,
        gaps: evaluation.gaps,
        rawLlmJson: evaluation as unknown as Prisma.InputJsonValue,
      },
    });
  }
}
