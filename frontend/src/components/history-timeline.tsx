import type { CallLog } from "@/api/types";
import { Card, CardTitle } from "@/components/ui/card";
import { RecordingPlayer } from "@/components/recording-player";
import { formatDateTime, formatDuration } from "@/lib/format";
import { OUTCOME_LABELS, OUTCOME_COLORS } from "@/lib/constants";
import { cn } from "@/lib/cn";

interface HistoryTimelineProps {
  callLogs?: CallLog[];
  /** When true, skip the Card + CardTitle wrapper (used when parent already provides its own section heading). */
  bare?: boolean;
}

export function HistoryTimeline({ callLogs = [], bare = false }: HistoryTimelineProps) {
  const sorted = [...callLogs].sort(
    (a, b) => new Date(b.called_at).getTime() - new Date(a.called_at).getTime()
  );

  const showAgent = sorted.some((c) => c.user_name);

  const table = sorted.length === 0 ? (
    <p className="text-sm text-[var(--color-text-secondary)]">
      Inga samtal ännu.
    </p>
  ) : (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[var(--color-bg-panel)]">
            <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">Datum</th>
            {showAgent && (
              <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">Agent</th>
            )}
            <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">Längd</th>
            <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">Utfall</th>
            <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">Anteckningar</th>
            <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">Inspelning</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((call, idx) => (
            <tr key={call.id} className={idx < sorted.length - 1 ? "border-b border-[var(--color-border)]" : ""}>
              <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-[var(--color-text-secondary)]">
                {formatDateTime(call.called_at)}
              </td>
              {showAgent && (
                <td className="px-4 py-3 text-[var(--color-text-primary)] font-medium">
                  {call.user_name ?? "—"}
                </td>
              )}
              <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                {call.duration > 0 ? formatDuration(call.duration) : "—"}
              </td>
              <td className="px-4 py-3">
                {call.outcome ? (
                  <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold", OUTCOME_COLORS[call.outcome] ?? "bg-slate-100 text-slate-600")}>
                    {OUTCOME_LABELS[call.outcome] ?? call.outcome}
                  </span>
                ) : (
                  <span className="text-[var(--color-text-secondary)]">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)] max-w-xs truncate">
                {call.notes ?? "—"}
              </td>
              <td className="px-4 py-3">
                {call.has_recording && (call.phone_call_id || call.id) ? (
                  <RecordingPlayer phoneCallId={call.phone_call_id ?? call.id} />
                ) : (
                  <span className="text-[var(--color-text-secondary)]">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  if (bare) return table;

  return (
    <Card>
      <CardTitle className="mb-4">Samtalshistorik</CardTitle>
      {table}
    </Card>
  );
}
