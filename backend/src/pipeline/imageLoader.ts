/** Reads an extracted image off the shared volume for the vision sub-model. */
import { readFile } from "node:fs/promises";
import { extname } from "node:path";

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function loadImageFromDisk(path: string): Promise<{ mimeType: string; data: Buffer }> {
  const data = await readFile(path);
  const mimeType = MIME_BY_EXT[extname(path).toLowerCase()] ?? "image/png";
  return { mimeType, data };
}
