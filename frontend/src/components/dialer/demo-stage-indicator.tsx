import { cn } from "@/lib/cn";
import type { DemoStage } from "@/api/types";

const STAGES: { key: DemoStage; label: string }[] = [
  { key: "meeting_booked", label: "Möte bokat" },
  { key: "generating", label: "Genererar" },
  { key: "demo_ready", label: "Demo klar" },
  { key: "followup", label: "Uppföljning" },
];

const ORDER: Record<DemoStage, number> = {
  meeting_booked: 0,
  generating: 1,
  demo_ready: 2,
  followup: 3,
  cancelled: -1,
};

interface DemoStageIndicatorProps {
  stage: DemoStage;
}

export function DemoStageIndicator({ stage }: DemoStageIndicatorProps) {
  const currentIdx = ORDER[stage] ?? -1;

  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      {STAGES.map((s, i) => {
        const isCompleted = i < currentIdx;
        const isCurrent = i === currentIdx;

        return (
          <div key={s.key} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-[var(--color-border)]">—</span>}
            <span
              className={cn(
                "px-2 py-0.5 rounded-full whitespace-nowrap",
                isCompleted && "bg-[#d1fae5] text-[#065f46]",
                isCurrent && "bg-[var(--color-accent)] text-white font-semibold",
                !isCompleted && !isCurrent && "text-[var(--color-text-secondary)]",
              )}
            >
              {isCompleted ? `✓ ${s.label}` : isCurrent ? `${i + 1}. ${s.label}` : s.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
