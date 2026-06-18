/**
 * Convert a (rich-text) HTML job description into clean plain text for the LLM
 * evaluation prompt. Dependency-free and conservative: it preserves block and
 * list boundaries as line breaks, strips tags, and decodes the handful of HTML
 * entities the editor emits. Plain-text JDs (no tags) pass through unchanged,
 * so this stays backward-compatible with jobs created before rich text.
 */
const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

export function htmlToText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "\n• ")
    .replace(/<\/\s*(p|div|li|h[1-6]|ul|ol|blockquote|tr)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
