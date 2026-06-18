import DOMPurify from "dompurify";
import { cn } from "../lib/cn";

/** Render admin-authored rich-text HTML for candidates. Sanitized with DOMPurify
 *  at the trust boundary, and styled with the same `prose` rules as the editor so
 *  it looks identical to what the admin typed. */
export function RichText({ html, className }: { html: string; className?: string }) {
  const clean = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  return (
    <div
      className={cn("jd-prose prose prose-slate max-w-none", className)}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
