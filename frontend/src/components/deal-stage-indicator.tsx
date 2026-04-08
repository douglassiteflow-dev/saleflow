import { cn } from "@/lib/cn";
import { Check, X } from "lucide-react";
import { getStageConfig } from "@/lib/pipeline-config";
import type { DealStage } from "@/api/types";

const STAGE_KEYS: DealStage[] = [
  "booking_wizard",
  "demo_scheduled",
  "meeting_completed",
  "questionnaire_sent",
  "contract_sent",
  "won",
];

const STAGES = STAGE_KEYS.map((key) => ({ key, label: getStageConfig(key).label }));

type StepState = "completed" | "current" | "upcoming" | "cancelled";

interface Props {
  currentStage: DealStage;
}

export function DealStageIndicator({ currentStage }: Props) {
  const isCancelled = currentStage === "cancelled";
  const currentIdx = STAGES.findIndex((s) => s.key === currentStage);

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {STAGES.map((stage, idx) => {
        let state: StepState;
        if (isCancelled) {
          state = "cancelled";
        } else if (currentStage === "won" || idx < currentIdx) {
          state = "completed";
        } else if (idx === currentIdx) {
          state = "current";
        } else {
          state = "upcoming";
        }

        return (
          <div
            key={stage.key}
            data-testid="stage-step"
            data-state={state}
            className="flex items-center gap-1.5"
          >
            {/* Circle */}
            <div
              className={cn(
                "flex shrink-0 items-center justify-center rounded-full text-[10px] font-medium transition-colors",
                state === "current" ? "h-7 w-7" : "h-6 w-6",
                state === "completed" &&
                  "bg-[var(--color-status-success)] text-white",
                state === "current" &&
                  "bg-[var(--color-accent-primary)] text-white ring-2 ring-[var(--color-accent-primary)]/20",
                state === "upcoming" &&
                  "border border-[var(--color-border-default)] text-[var(--color-text-secondary)]",
                state === "cancelled" &&
                  "bg-gray-200 text-gray-400",
              )}
            >
              {state === "completed" ? (
                <Check className="h-3 w-3" />
              ) : state === "cancelled" ? (
                <X className="h-3 w-3" />
              ) : (
                idx + 1
              )}
            </div>

            {/* Label — on mobile: only current stage visible, others as dots */}
            <span
              className={cn(
                "whitespace-nowrap",
                state === "current"
                  ? "text-[13px] font-semibold text-[var(--color-text-primary)]"
                  : state === "cancelled"
                    ? "text-[11px] text-gray-400 line-through hidden sm:inline"
                    : state === "completed"
                      ? "text-[11px] text-[var(--color-text-secondary)] hidden sm:inline"
                      : "text-[11px] text-[var(--color-text-secondary)] hidden sm:inline",
              )}
            >
              {stage.label}
            </span>

            {/* Connecting line — uses border-t for crisp rendering */}
            {idx < STAGES.length - 1 && (
              <div
                className={cn(
                  "h-px w-5 shrink-0 border-t",
                  state === "completed" || (idx < currentIdx && !isCancelled)
                    ? "border-[var(--color-status-success)]"
                    : state === "cancelled"
                      ? "border-gray-200"
                      : "border-[var(--color-border-default)]",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
