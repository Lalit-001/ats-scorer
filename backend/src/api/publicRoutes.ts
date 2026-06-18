/** Candidate-facing routes: view a job and submit an application. */
import { Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { Op, fn, col, where, UniqueConstraintError } from "sequelize";
import { JobDescription, Application } from "../db/models/index.js";
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
    const job = await JobDescription.findOne({ where: { slug: req.params.slug } });
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
    // multer has already saved the upload to disk by now; remove it on any rejection.
    const removeUpload = async () => {
      if (req.file?.path) await unlink(req.file.path).catch(() => {});
    };

    const job = await JobDescription.findOne({ where: { slug: req.params.slug } });
    if (!job) {
      await removeUpload();
      res.status(404).json({ error: "Job not found" });
      return;
    }

    const name = String(req.body?.name ?? "").trim();
    const email = String(req.body?.email ?? "").trim();
    if (!name || !email) {
      await removeUpload();
      res.status(400).json({ error: "name and email are required" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "resume PDF is required" });
      return;
    }

    // One application per (job, email), case-insensitive.
    const duplicate = await Application.findOne({
      where: { jobId: job.id, [Op.and]: [where(fn("lower", col("email")), email.toLowerCase())] },
    });
    if (duplicate) {
      await removeUpload();
      res.status(409).json({ error: "You have already applied to this job with this email." });
      return;
    }

    try {
      const application = await Application.create({
        jobId: job.id,
        name,
        email,
        resumePath: req.file.path,
        status: "uploaded",
      });
      await enqueueApplication(application.id);
      res.status(202).json({ id: application.id, status: application.status });
    } catch (err) {
      // Lost the race against a concurrent submit — the unique index caught it.
      if (err instanceof UniqueConstraintError) {
        await removeUpload();
        res.status(409).json({ error: "You have already applied to this job with this email." });
        return;
      }
      throw err;
    }
  }),
);
