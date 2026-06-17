/** API entrypoint: Express app wiring public + admin routes and static files. */
import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import { config } from "./config.js";
import { publicRouter } from "./api/publicRoutes.js";
import { adminRouter } from "./api/adminRoutes.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));

// Serve uploaded resumes / extracted images off the shared volume.
app.use("/files", express.static(config.dataDir));

app.use("/api", publicRouter);
app.use("/api/admin", adminRouter);

// Upload/validation errors (e.g. non-PDF, too large) surface as 400.
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error("[api]", err?.message ?? err);
  res.status(400).json({ error: err?.message ?? "Bad request" });
};
app.use(errorHandler);

app.listen(config.port, () => console.log(`[api] listening on :${config.port}`));
