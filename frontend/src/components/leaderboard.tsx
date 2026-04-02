import { Card, CardTitle } from "@/components/ui/card";
import type { LeaderboardEntry } from "@/api/dashboard";

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  currentUserId?: string;
}

export function Leaderboard({ entries, currentUserId }: LeaderboardProps) {
  if (entries.length === 0) {
    return (
      <Card>
        <CardTitle className="mb-4">Dagens leaderboard</CardTitle>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Ingen aktivitet ännu idag
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle className="mb-4">Dagens leaderboard</CardTitle>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-[var(--color-text-secondary)]">
            <th className="text-left font-medium py-2 px-2 w-8">#</th>
            <th className="text-left font-medium py-2 px-2">Agent</th>
            <th className="text-right font-medium py-2 px-2">Samtal</th>
            <th className="text-right font-medium py-2 px-2">Möten (netto)</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => {
            const isCurrentUser = entry.user_id === currentUserId;
            const isTop = index === 0;

            return (
              <tr
                key={entry.user_id}
                className={
                  isCurrentUser
                    ? "bg-indigo-50"
                    : "hover:bg-[var(--color-bg-panel)] transition-colors"
                }
              >
                <td className="py-2 px-2 font-mono text-[var(--color-text-secondary)] text-right">
                  {isTop ? "🏆" : index + 1}
                </td>
                <td className="py-2 px-2 font-medium text-[var(--color-text-primary)]">
                  {entry.name}
                  {isCurrentUser && (
                    <span className="ml-1.5 text-xs text-indigo-500 font-normal">(du)</span>
                  )}
                </td>
                <td className="py-2 px-2 text-right font-mono text-[var(--color-text-secondary)]">
                  {entry.calls_today}
                </td>
                <td className="py-2 px-2 text-right font-mono font-semibold text-[var(--color-text-primary)]">
                  {entry.net_meetings_today}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
