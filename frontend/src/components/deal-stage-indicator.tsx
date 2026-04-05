import { cn } from "@/lib/cn";
import { Check } from "lucide-react";
import type { DealStage } from "@/api/types";

const STAGES: { key: DealStage; label: string }[] = [
  { key: "meeting_booked", label: "Möte bokat" },
  { key: "needs_website", label: "Behöver hemsida" },
  { key: "generating_website", label: "Genereras" },
  { key: "reviewing", label: "Granskning" },
  { key: "deployed", label: "Deployad" },
  { key: "demo_followup", label: "Demo & uppföljning" },
  { key: "contract_sent", label: "Avtal skickat" },
  { key: "signed", label: "Signerat" },
  { key: "dns_launch", label: "DNS & Lansering" },
  { key: "won", label: "Klar" },
];

interface Props {
  currentStage: DealStage;
}

export function DealStageIndicator({ currentStage }: Props) {
  const currentIdx = STAGES.findIndex((s) => s.key === currentStage);

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-2">
      {STAGES.map((stage, idx) => {
        const state =
          currentStage === "won" || idx < currentIdx
            ? "completed"
            : idx === currentIdx
              ? "current"
              : "upcoming";

        return (
          <div
            key={stage.key}
            data-testid="stage-step"
            data-state={state}
            className="flex items-center gap-1"
          >
            <div
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-medium",
                state === "completed" &&
                  "bg-[var(--color-status-success)] text-white",
                state === "current" &&
                  "bg-[var(--color-accent-primary)] text-white",
                state === "upcoming" &&
                  "bg-[var(--color-border-default)] text-[var(--color-text-secondary)]",
              )}
            >
              {state === "completed" ? (
                <Check className="h-3 w-3" />
              ) : (
                idx + 1
              )}
            </div>
            <span
              className={cn(
                "whitespace-nowrap text-[11px]",
                state === "current"
                  ? "font-medium text-[var(--color-text-primary)]"
                  : "text-[var(--color-text-secondary)]",
              )}
            >
              {stage.label}
            </span>
            {idx < STAGES.length - 1 && (
              <div
                className={cn(
                  "h-px w-4 shrink-0",
                  idx < currentIdx
                    ? "bg-[var(--color-status-success)]"
                    : "bg-[var(--color-border-default)]",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
