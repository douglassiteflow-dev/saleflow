import { memo } from "react";
import { cn } from "@/lib/cn";

interface StatCardProps {
  label: string;
  value: number | string;
  suffix?: string;
  className?: string;
}

export const StatCard = memo(function StatCard({
  label,
  value,
  suffix,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-[14px] bg-[var(--color-bg-primary)] p-[var(--spacing-card)] shadow-[0_1px_3px_rgba(0,0,0,0.04)]",
        className,
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-[1px] text-[var(--color-text-secondary)]">
        {label}
      </p>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-[40px] font-light leading-none tracking-[-2px] text-[var(--color-text-primary)]">
          {value}
        </span>
        {suffix && (
          <span className="text-lg font-light text-[var(--color-text-secondary)]">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
});
