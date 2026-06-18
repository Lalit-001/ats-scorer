import { cn } from "../lib/cn";
import { scoreTone } from "../lib/format";

/** Compact score + track bar for table cells. */
export function ScoreCell({ score }: { score: number | null }) {
  if (score == null) return <span className="text-slate-300">—</span>;
  const tone = scoreTone(score);
  return (
    <div className="w-20">
      <div className={cn("font-mono text-sm font-semibold tabular-nums", tone.text)}>
        {score}
        <span className="text-xs text-slate-400">%</span>
      </div>
      <div className={cn("mt-1 h-1.5 w-full overflow-hidden rounded-full", tone.track)}>
        <div className={cn("h-full rounded-full", tone.bar)} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

/** Large score meter for the application detail page. */
export function ScoreMeter({ score }: { score: number }) {
  const tone = scoreTone(score);
  return (
    <div className="w-full max-w-xs">
      <div className="flex items-baseline gap-1">
        <span className={cn("font-mono text-4xl font-semibold tabular-nums", tone.text)}>
          {score}
        </span>
        <span className="text-lg text-slate-400">%</span>
        <span className="ml-2 text-xs uppercase tracking-wide text-slate-400">match</span>
      </div>
      <div className={cn("mt-2 h-2 w-full overflow-hidden rounded-full", tone.track)}>
        <div className={cn("h-full rounded-full", tone.bar)} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}
