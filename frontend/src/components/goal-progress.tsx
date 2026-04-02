import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { GoalProgress as GoalProgressType } from "@/api/types";

interface GoalProgressProps {
  goals: GoalProgressType[];
}

const METRIC_LABELS: Record<string, string> = {
  meetings_per_week: "Möten denna vecka",
  calls_per_day: "Samtal per dag",
};

function getWeekInfo(): string {
  const now = new Date();
  const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay();

  // ISO week number
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const daysSinceJan1 = Math.floor(
    (now.getTime() - jan1.getTime()) / 86_400_000,
  );
  const weekNum = Math.ceil((daysSinceJan1 + jan1.getDay() + 1) / 7);

  return `v.${weekNum} · ${dayOfWeek} av 7 dagar`;
}

export function GoalProgress({ goals }: GoalProgressProps) {
  if (goals.length === 0) return null;

  return (
    <Card className="!rounded-[14px] !border-0 !shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between mb-4">
        <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">
          Veckans mål
        </span>
        <span className="text-[11px] text-[var(--color-text-secondary)]">
          {getWeekInfo()}
        </span>
      </div>
      <div className="space-y-3.5">
        {goals.map((goal) => {
          const isComplete = goal.current_value >= goal.target_value;

          return (
            <div key={goal.id}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[13px] text-slate-700">
                  {METRIC_LABELS[goal.metric] ?? goal.metric}
                </span>
                <span className="text-[13px] font-medium text-[var(--color-text-primary)]">
                  {goal.current_value}{" "}
                  <span className="font-normal text-[var(--color-text-secondary)]">
                    / {goal.target_value}
                  </span>
                  {isComplete && (
                    <span className="ml-1 text-[var(--color-success)]">✓</span>
                  )}
                </span>
              </div>
              <Progress value={goal.current_value} max={goal.target_value} />
            </div>
          );
        })}
      </div>
    </Card>
  );
}
