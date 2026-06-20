/** Admin dashboard routes (all but /login require the admin bearer token). */
import { Router } from "express";
import { fn, col } from "sequelize";
import {
  JobDescription,
  Application,
  PipelineRun,
  ExtractedImage,
  Evaluation,
} from "../db/models/index.js";
import { config } from "../config.js";
import { login, requireAdmin } from "./auth.js";
import { slugify } from "./slug.js";
import { enqueueApplication } from "../queue/queue.js";
import { ah } from "./asyncHandler.js";

export const adminRouter = Router();

const toFileUrl = (p: string | null) => (p ? "/files" + p.slice(config.dataDir.length) : null);

adminRouter.post("/login", login);
adminRouter.use(requireAdmin);

adminRouter.post(
  "/jobs",
  ah(async (req, res) => {
    const { title, description } = req.body ?? {};
    if (!title || !description) {
      res.status(400).json({ error: "title and description are required" });
      return;
    }
    const job = await JobDescription.create({ title, description, slug: slugify(title) });
    res.status(201).json({ id: job.id, slug: job.slug, applyUrl: `/apply/${job.slug}` });
  }),
);

adminRouter.get(
  "/jobs",
  ah(async (_req, res) => {
    const jobs = await JobDescription.findAll({ order: [["createdAt", "DESC"]] });
    const counts = (await Application.findAll({
      attributes: ["jobId", [fn("COUNT", col("id")), "count"]],
      group: ["jobId"],
      raw: true,
    })) as unknown as { jobId: string; count: string }[];
    const countByJob = new Map(counts.map((c) => [c.jobId, Number(c.count)]));

    res.json(
      jobs.map((j) => ({
        id: j.id,
        title: j.title,
        slug: j.slug,
        applicants: countByJob.get(j.id) ?? 0,
        createdAt: j.createdAt,
      })),
    );
  }),
);

adminRouter.get(
  "/jobs/:id",
  ah(async (req, res) => {
    const job = await JobDescription.findByPk(req.params.id);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json({ id: job.id, title: job.title, slug: job.slug, description: job.description });
  }),
);

adminRouter.patch(
  "/jobs/:id",
  ah(async (req, res) => {
    const { title, description } = req.body ?? {};
    if (!title || !description) {
      res.status(400).json({ error: "title and description are required" });
      return;
    }
    const job = await JobDescription.findByPk(req.params.id);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    // Slug is intentionally left unchanged so existing apply links keep working.
    await job.update({ title, description });
    res.json({ id: job.id, title: job.title, slug: job.slug });
  }),
);

adminRouter.get(
  "/jobs/:id/applications",
  ah(async (req, res) => {
    const apps = await Application.findAll({
      where: { jobId: req.params.id },
      order: [["createdAt", "DESC"]],
      include: [
        { model: Evaluation, as: "evaluation" },
        { model: ExtractedImage, as: "extractedImages", attributes: ["imageType"] },
      ],
    });
    res.json(
      apps.map((a) => ({
        id: a.id,
        name: a.name,
        email: a.email,
        status: a.status,
        errorStage: a.errorStage,
        errorMessage: a.errorMessage,
        resumeUrl: toFileUrl(a.resumePath),
        basicDetails: a.basicDetails ?? null,
        matchScore: a.evaluation?.matchScore ?? null,
        recommendation: a.evaluation?.recommendation ?? null,
        hasCertificate: (a.extractedImages ?? []).some((i) => i.imageType === "certificate"),
        createdAt: a.createdAt,
      })),
    );
  }),
);

adminRouter.get(
  "/applications/:id",
  ah(async (req, res) => {
    const app = await Application.findByPk(req.params.id, {
      include: [
        { model: JobDescription, as: "job" },
        { model: Evaluation, as: "evaluation" },
        { model: ExtractedImage, as: "extractedImages" },
        { model: PipelineRun, as: "pipelineRuns" },
      ],
    });
    if (!app) {
      res.status(404).json({ error: "Application not found" });
      return;
    }
    const runByStage = (stage: string) =>
      (app.pipelineRuns ?? []).find((r) => r.stage === stage);

    res.json({
      id: app.id,
      name: app.name,
      email: app.email,
      status: app.status,
      errorStage: app.errorStage,
      errorMessage: app.errorMessage,
      resumeUrl: toFileUrl(app.resumePath),
      basicDetails: app.basicDetails ?? null,
      job: { title: app.job?.title, description: app.job?.description },
      resume: runByStage("structure")?.structuredOutput ?? null,
      links:
        (runByStage("structure")?.structuredOutput as { links?: unknown } | undefined)?.links ??
        null,
      runs: (app.pipelineRuns ?? []).map((r) => ({
        stage: r.stage,
        status: r.status,
        error: r.error,
      })),
      images: (app.extractedImages ?? []).map((i) => ({
        imageType: i.imageType,
        details: i.details,
        url: toFileUrl(i.imagePath),
      })),
      evaluation: app.evaluation
        ? {
            matchScore: app.evaluation.matchScore,
            recommendation: app.evaluation.recommendation,
            dimensions: app.evaluation.dimensions ?? null,
            strengths: app.evaluation.strengths,
            gaps: app.evaluation.gaps,
          }
        : null,
    });
  }),
);

adminRouter.post(
  "/applications/:id/reprocess",
  ah(async (req, res) => {
    const app = await Application.findByPk(req.params.id);
    if (!app) {
      res.status(404).json({ error: "Application not found" });
      return;
    }
    await Evaluation.destroy({ where: { applicationId: app.id } });
    await ExtractedImage.destroy({ where: { applicationId: app.id } });
    await PipelineRun.destroy({ where: { applicationId: app.id } });
    await app.update({ status: "uploaded", errorStage: null, errorMessage: null });
    await enqueueApplication(app.id);
    res.status(202).json({ id: app.id, status: "uploaded" });
  }),
);
