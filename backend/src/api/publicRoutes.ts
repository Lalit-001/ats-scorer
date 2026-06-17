/** Candidate-facing routes: view a job and submit an application. */
import { Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../db/prisma.js";
import { config } from "../config.js";
import { enqueueApplication } from "../queue/queue.js";
import { ah } from "./asyncHandler.js";

const resumeDir = join(config.dataDir, "resumes");
mkdirSync(resumeDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, resumeDir),
    filename: (_req, _file, cb) => cb(null, `${randomUUID()}.pdf`),
  }),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      cb(new Error("Only PDF files are allowed"));
      return;
    }
    cb(null, true);
  },
});

export const publicRouter = Router();

publicRouter.get(
  "/jobs/:slug",
  ah(async (req, res) => {
    const job = await prisma.jobDescription.findUnique({ where: { slug: req.params.slug } });
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json({ id: job.id, title: job.title, description: job.description, slug: job.slug });
  }),
);

publicRouter.post(
  "/jobs/:slug/apply",
  upload.single("resume"),
  ah(async (req, res) => {
    const job = await prisma.jobDescription.findUnique({ where: { slug: req.params.slug } });
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    const { name, email } = req.body ?? {};
    if (!name || !email) {
      res.status(400).json({ error: "name and email are required" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "resume PDF is required" });
      return;
    }

    const application = await prisma.application.create({
      data: { jobId: job.id, name, email, resumePath: req.file.path, status: "uploaded" },
    });
    await enqueueApplication(application.id);
    res.status(202).json({ id: application.id, status: application.status });
  }),
);
