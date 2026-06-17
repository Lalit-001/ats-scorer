/** Minimal POC admin auth: static password -> shared bearer token. */
import type { Request, Response, NextFunction } from "express";
import { config } from "../config.js";

export function login(req: Request, res: Response): void {
  const { password } = req.body ?? {};
  if (password !== config.adminPassword) {
    res.status(401).json({ error: "Invalid password" });
    return;
  }
  res.json({ token: config.adminTokenSecret });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (token !== config.adminTokenSecret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
