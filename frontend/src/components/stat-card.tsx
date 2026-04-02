import { memo } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

interface StatCardProps {
  label: string;
  value: number | string;
  className?: string;
}

export const StatCard = memo(function StatCard({ label, value, className }: StatCardProps) {
  return (
    <Card className={cn("flex flex-col gap-1", className)}>
      <p
        className="text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-secondary)]"
      >
        {label}
      </p>
      <p
        className="text-4xl font-semibold text-[var(--color-text-primary)]"
        style={{ fontSize: "36px", fontWeight: 600, lineHeight: "1.1" }}
      >
        {value}
      </p>
    </Card>
  );
});
