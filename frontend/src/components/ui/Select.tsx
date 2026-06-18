import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm",
          "focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30",
          className,
        )}
        {...props}
      >
        {children}
      </select>
    );
  },
);
