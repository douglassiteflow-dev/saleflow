import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import type { LeaderboardEntry } from "@/api/dashboard";

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  currentUserId?: string;
}

export function Leaderboard({ entries, currentUserId }: LeaderboardProps) {
  if (entries.length === 0) {
    return (
      <Card className="!rounded-[14px] !border-0 !shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">
            Leaderboard
          </span>
        </div>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Ingen aktivitet ännu idag
        </p>
      </Card>
    );
  }

  return (
    <Card className="!rounded-[14px] !border-0 !shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between mb-4">
        <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">
          Leaderboard
        </span>
        <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide text-blue-600">
          LIVE
        </span>
      </div>
      <div className="space-y-1.5">
        {entries.map((entry, index) => {
          const isCurrentUser = entry.user_id === currentUserId;
          const isTop = index === 0;

          return (
            <div
              key={entry.user_id}
              className={cn(
                "flex items-center gap-3 rounded-[10px] px-3.5 py-2.5",
                isCurrentUser && "bg-[var(--color-bg-panel)]",
              )}
            >
              <div
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  isTop
                    ? "bg-gradient-to-br from-[var(--color-accent)] to-violet-500 text-white"
                    : "bg-slate-200 text-[var(--color-text-secondary)]",
                )}
              >
                {index + 1}
              </div>
              <div className="min-w-0 flex-1">
                <span
                  className={cn(
                    "text-sm",
                    isTop
                      ? "font-medium text-[var(--color-text-primary)]"
                      : "text-[var(--color-text-secondary)]",
                  )}
                >
                  {entry.name}
                  {isCurrentUser && (
                    <span className="ml-1.5 text-xs font-normal text-[var(--color-accent)]">
                      (du)
                    </span>
                  )}
                </span>
              </div>
              <div className="shrink-0 text-right">
                <div
                  className={cn(
                    "text-[13px] font-semibold",
                    isTop
                      ? "text-[var(--color-text-primary)]"
                      : "text-slate-700",
                  )}
                >
                  {entry.net_meetings_today} möten
                  {entry.meetings_cancelled_today > 0 && (
                    <span className="ml-1 text-[11px] font-normal text-red-400">
                      ({entry.meetings_cancelled_today} avbokade)
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-[var(--color-text-secondary)]">
                  {entry.calls_today} samtal
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
