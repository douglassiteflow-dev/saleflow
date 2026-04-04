import type { CallLog } from "@/api/types";
import { Card, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";

const OUTCOME_LABELS: Record<string, string> = {
  meeting_booked: "Möte bokat",
  callback: "Återuppringning",
  not_interested: "Ej intresserad",
  no_answer: "Ej svar",
  call_later: "Ring senare",
  bad_number: "Fel nummer",
  customer: "Kund",
  other: "Övrigt",
};

function formatDuration(seconds: number): string {
  if (!seconds || seconds === 0) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function dotColor(outcome: string): string {
  if (outcome === "meeting_booked") return "bg-emerald-500";
  if (outcome === "not_interested") return "bg-rose-500";
  if (outcome === "customer") return "bg-indigo-500";
  if (outcome === "callback") return "bg-amber-500";
  if (outcome === "bad_number") return "bg-red-500";
  return "bg-indigo-400";
}

interface HistoryTimelineProps {
  callLogs?: CallLog[];
}

export function HistoryTimeline({ callLogs = [] }: HistoryTimelineProps) {
  const sorted = [...callLogs].sort(
    (a, b) => new Date(b.called_at).getTime() - new Date(a.called_at).getTime()
  );

  return (
    <Card>
      <CardTitle className="mb-4">Samtalshistorik</CardTitle>

      {sorted.length === 0 ? (
        <p className="text-sm text-[var(--color-text-secondary)]">
          Inga samtal ännu.
        </p>
      ) : (
        <ol className="relative ml-3 space-y-0">
          {sorted.map((call, idx) => (
            <li key={call.id} className="relative pl-6 pb-5 last:pb-0">
              {idx < sorted.length - 1 && (
                <span
                  className="absolute left-[7px] top-3 bottom-0 w-px bg-[var(--color-border)]"
                  aria-hidden
                />
              )}

              <span
                className={cn(
                  "absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white",
                  dotColor(call.outcome ?? ""),
                )}
                aria-hidden
              />

              <div>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-sm font-medium text-[var(--color-text-primary)]">
                    {OUTCOME_LABELS[call.outcome ?? ""] ?? "Samtal"}
                  </span>
                  {call.user_name && (
                    <span className="text-[11px] font-semibold text-[var(--color-text-primary)]">
                      — {call.user_name}
                    </span>
                  )}
                  {call.duration > 0 && (
                    <span className="text-[11px] text-[var(--color-text-secondary)]">
                      {formatDuration(call.duration)}
                    </span>
                  )}
                  <span className="text-[11px] font-mono text-[var(--color-text-secondary)]">
                    {formatDateTime(call.called_at)}
                  </span>
                </div>

                {call.notes && (
                  <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                    {call.notes}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
