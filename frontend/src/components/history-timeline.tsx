import type { CallLog, AuditLog } from "@/api/types";
import { Card, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";

type TimelineEntry =
  | { kind: "call"; data: CallLog }
  | { kind: "audit"; data: AuditLog };

function getTimestamp(entry: TimelineEntry): string {
  if (entry.kind === "call") return entry.data.called_at;
  return entry.data.created_at;
}

interface HistoryTimelineProps {
  callLogs?: CallLog[];
  auditLogs?: AuditLog[];
}

const outcomeLabels: Record<string, string> = {
  meeting_booked: "Möte bokat",
  callback: "Återuppringning",
  not_interested: "Inte intresserad",
  no_answer: "Svarar ej",
  bad_number: "Fel nummer",
  customer: "Kund",
};

export function HistoryTimeline({ callLogs = [], auditLogs = [] }: HistoryTimelineProps) {
  const entries: TimelineEntry[] = [
    ...callLogs.map((c): TimelineEntry => ({ kind: "call", data: c })),
    ...auditLogs.map((a): TimelineEntry => ({ kind: "audit", data: a })),
  ].sort((a, b) => {
    const ta = new Date(getTimestamp(a)).getTime();
    const tb = new Date(getTimestamp(b)).getTime();
    return tb - ta; // desc
  });

  return (
    <Card>
      <CardTitle className="mb-4">Historik</CardTitle>

      {entries.length === 0 ? (
        <p className="text-sm text-[var(--color-text-secondary)]">
          Ingen historik ännu.
        </p>
      ) : (
        <ol className="relative ml-3 space-y-0">
          {entries.map((entry, idx) => {
            const isCall = entry.kind === "call";
            const timestamp = getTimestamp(entry);

            return (
              <li key={idx} className="relative pl-6 pb-5 last:pb-0">
                {/* Vertical line */}
                {idx < entries.length - 1 && (
                  <span
                    className="absolute left-[7px] top-3 bottom-0 w-px bg-[var(--color-border)]"
                    aria-hidden
                  />
                )}

                {/* Dot */}
                <span
                  className={cn(
                    "absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white",
                    isCall ? "bg-indigo-500" : "bg-slate-300",
                  )}
                  aria-hidden
                />

                <div>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm font-medium text-[var(--color-text-primary)]">
                      {isCall
                        ? outcomeLabels[entry.data.outcome ?? ""] ?? "Samtal"
                        : entry.data.action}
                    </span>
                    <span className="text-[11px] font-mono text-[var(--color-text-secondary)]">
                      {formatDateTime(timestamp)}
                    </span>
                    {isCall && entry.data.user && (
                      <span className="text-[11px] text-[var(--color-text-secondary)]">
                        av {entry.data.user.name}
                      </span>
                    )}
                  </div>

                  {isCall && entry.data.notes && (
                    <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                      {entry.data.notes}
                    </p>
                  )}

                  {!isCall &&
                    entry.data.details &&
                    Object.keys(entry.data.details).length > 0 && (
                      <p className="mt-1 text-[11px] font-mono text-[var(--color-text-secondary)] bg-[var(--color-bg-panel)] rounded px-2 py-1">
                        {JSON.stringify(entry.data.details)}
                      </p>
                    )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
