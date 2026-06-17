import { randomBytes } from "node:crypto";

/** Builds a URL-safe, unique-ish slug from a job title. */
export function slugify(title: string): string {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40) || "job";
  return `${base}-${randomBytes(3).toString("hex")}`;
}
