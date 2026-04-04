import type { LeaderboardEntry } from "@/api/dashboard";
import { cn } from "@/lib/cn";

interface MiniLeaderboardProps {
  entries: LeaderboardEntry[];
  currentUserId?: string;
}

export function MiniLeaderboard({ entries, currentUserId }: MiniLeaderboardProps) {
  return (
    <div className="flex items-center gap-3 px-5 py-2 bg-[var(--color-bg-panel)] border-b border-[var(--color-border)] overflow-x-auto">
      <span className="text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)] whitespace-nowrap">
        Idag
      </span>
      {entries.map((entry, index) => {
        const rank = index + 1;
        const isCurrentUser = entry.user_id === currentUserId;
        const isLeader = rank === 1;

        return (
          <div
            key={entry.user_id}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-[5px] whitespace-nowrap border",
              isCurrentUser
                ? "bg-indigo-50 border-indigo-200"
                : isLeader
                  ? "bg-[var(--color-bg-primary)] border-indigo-200"
                  : "bg-[var(--color-bg-primary)] border-[var(--color-border)]",
            )}
          >
            <span
              className={cn(
                "text-[11px] font-semibold",
                isLeader
                  ? "text-[var(--color-accent)]"
                  : "text-[var(--color-text-secondary)]",
              )}
            >
              {rank}.
            </span>
            <span className="text-xs font-medium text-[var(--color-text-primary)]">
              {entry.name}
              {isCurrentUser && (
                <span className="ml-1 text-[10px] font-normal text-[var(--color-accent)]">
                  (du)
                </span>
              )}
            </span>
            <span className="text-[11px] text-[var(--color-text-secondary)]">
              {entry.calls_today} samtal
            </span>
            <span className="text-[11px] font-medium text-[var(--color-success)]">
              {entry.net_meetings_today} {entry.net_meetings_today === 1 ? "möte" : "möten"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
