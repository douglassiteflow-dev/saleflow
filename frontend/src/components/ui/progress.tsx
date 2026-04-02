import { type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  variant?: "indigo" | "green";
}

export function Progress({
  value,
  max = 100,
  variant = "indigo",
  className,
  ...props
}: ProgressProps) {
  const percentage = Math.min((value / max) * 100, 100);
  const isComplete = value >= max;
  const effectiveVariant = isComplete ? "green" : variant;

  const gradients = {
    indigo: "bg-gradient-to-r from-[var(--color-accent)] to-indigo-400",
    green: "bg-gradient-to-r from-[var(--color-success)] to-emerald-400",
  };

  return (
    <div
      className={cn("h-2 w-full rounded-full bg-slate-100", className)}
      {...props}
    >
      <div
        className={cn(
          "h-full rounded-full transition-all duration-500",
          gradients[effectiveVariant],
        )}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}
