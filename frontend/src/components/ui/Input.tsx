import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm",
          "placeholder:text-slate-400",
          "focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30",
          "disabled:cursor-not-allowed disabled:bg-slate-50",
          className,
        )}
        {...props}
      />
    );
  },
);
