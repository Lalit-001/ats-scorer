import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export function Card({
  children,
  className,
  noPadding = false,
}: {
  children: ReactNode;
  className?: string;
  noPadding?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200 bg-white shadow-sm",
        !noPadding && "p-6",
        className,
      )}
    >
      {children}
    </div>
  );
}
