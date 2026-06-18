/** The match-score spectrum — the app's signature: emerald ≥ 75, amber ≥ 50, rose below.
 *  Used everywhere a score appears so the color carries meaning consistently. */
export function scoreTone(score: number): { text: string; bar: string; track: string } {
  if (score >= 75) return { text: "text-emerald-600", bar: "bg-emerald-500", track: "bg-emerald-100" };
  if (score >= 50) return { text: "text-amber-600", bar: "bg-amber-500", track: "bg-amber-100" };
  return { text: "text-rose-600", bar: "bg-rose-500", track: "bg-rose-100" };
}

const REC_LABELS: Record<string, string> = {
  strong_match: "Strong match",
  good_match: "Good match",
  reject: "Reject",
};

export function recommendationLabel(value: string): string {
  return REC_LABELS[value] ?? value.replace(/_/g, " ");
}

/** Compact relative time, e.g. "3m ago", "2d ago". */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const sec = Math.round((Date.now() - then) / 1000);
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}
