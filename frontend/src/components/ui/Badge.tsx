import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export type Tone = "slate" | "indigo" | "emerald" | "amber" | "rose";

const TONES: Record<Tone, string> = {
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  rose: "bg-rose-50 text-rose-700 ring-rose-200",
};

const DOTS: Record<Tone, string> = {
  slate: "bg-slate-400",
  indigo: "bg-indigo-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
};

export function Badge({
  tone = "slate",
  dot = false,
  children,
  className,
}: {
  tone?: Tone;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        TONES[tone],
        className,
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", DOTS[tone])} />}
      {children}
    </span>
  );
}
