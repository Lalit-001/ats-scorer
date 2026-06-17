/** Admin dashboard routes (all but /login require the admin bearer token). */
import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { config } from "../config.js";
import { login, requireAdmin } from "./auth.js";
import { slugify } from "./slug.js";
import { enqueueApplication } from "../queue/queue.js";
import { ah } from "./asyncHandler.js";

export const adminRouter = Router();

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
    const job = await prisma.jobDescription.create({
      data: { title, description, slug: slugify(title) },
    });
    res.status(201).json({ id: job.id, slug: job.slug, applyUrl: `/apply/${job.slug}` });
  }),
);

adminRouter.get(
  "/jobs",
  ah(async (_req, res) => {
    const jobs = await prisma.jobDescription.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { applications: true } } },
    });
    res.json(
      jobs.map((j) => ({
        id: j.id,
        title: j.title,
        slug: j.slug,
        applicants: j._count.applications,
        createdAt: j.createdAt,
      })),
    );
  }),
);

adminRouter.get(
  "/jobs/:id/applications",
  ah(async (req, res) => {
    const apps = await prisma.application.findMany({
      where: { jobId: req.params.id },
      orderBy: { createdAt: "desc" },
      include: { evaluation: true },
    });
    res.json(
      apps.map((a) => ({
        id: a.id,
        name: a.name,
        email: a.email,
        status: a.status,
        errorStage: a.errorStage,
        errorMessage: a.errorMessage,
        matchScore: a.evaluation?.matchScore ?? null,
        recommendation: a.evaluation?.recommendation ?? null,
        createdAt: a.createdAt,
      })),
    );
  }),
);

adminRouter.get(
  "/applications/:id",
  ah(async (req, res) => {
    const app = await prisma.application.findUnique({
      where: { id: req.params.id },
      include: { job: true, evaluation: true, extractedImages: true, pipelineRuns: true },
    });
    if (!app) {
      res.status(404).json({ error: "Application not found" });
      return;
    }
    const toUrl = (p: string) => "/files" + p.slice(config.dataDir.length);
    const runByStage = (stage: string) => app.pipelineRuns.find((r) => r.stage === stage);

    res.json({
      id: app.id,
      name: app.name,
      email: app.email,
      status: app.status,
      errorStage: app.errorStage,
      errorMessage: app.errorMessage,
      job: { title: app.job.title, description: app.job.description },
      resume: runByStage("submodel_a")?.structuredOutput ?? null,
      links: runByStage("submodel_c")?.structuredOutput ?? null,
      runs: app.pipelineRuns.map((r) => ({ stage: r.stage, status: r.status, error: r.error })),
      images: app.extractedImages.map((i) => ({
        imageType: i.imageType,
        details: i.details,
        url: toUrl(i.imagePath),
      })),
      evaluation: app.evaluation
        ? {
            matchScore: app.evaluation.matchScore,
            recommendation: app.evaluation.recommendation,
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
    const app = await prisma.application.findUnique({ where: { id: req.params.id } });
    if (!app) {
      res.status(404).json({ error: "Application not found" });
      return;
    }
    await prisma.$transaction([
      prisma.evaluation.deleteMany({ where: { applicationId: app.id } }),
      prisma.extractedImage.deleteMany({ where: { applicationId: app.id } }),
      prisma.pipelineRun.deleteMany({ where: { applicationId: app.id } }),
      prisma.application.update({
        where: { id: app.id },
        data: { status: "uploaded", errorStage: null, errorMessage: null },
      }),
    ]);
    await enqueueApplication(app.id);
    res.status(202).json({ id: app.id, status: "uploaded" });
  }),
);
