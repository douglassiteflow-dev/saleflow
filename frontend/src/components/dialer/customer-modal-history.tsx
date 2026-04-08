import { RecordingPlayer } from "@/components/recording-player";
import { cn } from "@/lib/cn";
import type { CallLog, Outcome } from "@/api/types";

interface CustomerModalHistoryProps {
  calls: CallLog[];
}

const OUTCOME_BADGES: Record<Outcome, { label: string; className: string }> = {
  meeting_booked: { label: "Möte bokat", className: "border-emerald-300 bg-emerald-50 text-emerald-700" },
  callback: { label: "Återuppringning", className: "border-amber-300 bg-amber-50 text-amber-700" },
  not_interested: { label: "Ej intresserad", className: "border-rose-200 bg-rose-50 text-rose-700" },
  no_answer: { label: "Ej svar", className: "border-slate-200 bg-slate-50 text-slate-600" },
  call_later: { label: "Ring senare", className: "border-blue-200 bg-blue-50 text-blue-700" },
  bad_number: { label: "Fel nummer", className: "border-red-200 bg-red-50 text-red-700" },
  customer: { label: "Kund", className: "border-emerald-300 bg-emerald-50 text-emerald-700" },
};

function formatSwedishDate(iso: string): string {
  const d = new Date(iso);
  const months = [
    "januari", "februari", "mars", "april", "maj", "juni",
    "juli", "augusti", "september", "oktober", "november", "december",
  ];
  const day = d.getDate();
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const hours = d.getHours().toString().padStart(2, "0");
  const minutes = d.getMinutes().toString().padStart(2, "0");
  return `${day} ${month} ${year}, ${hours}:${minutes}`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function CustomerModalHistory({ calls }: CustomerModalHistoryProps) {
  if (calls.length === 0) {
    return (
      <div className="px-6 py-10 text-center text-[13px] text-[var(--color-text-secondary)]">
        Ingen samtalshistorik
      </div>
    );
  }

  return (
    <div className="divide-y divide-[var(--color-border)]">
      {calls.map((call) => {
        const badge = OUTCOME_BADGES[call.outcome];
        return (
          <div key={call.id} className="px-6 py-4 space-y-2">
            {/* Top row: date + outcome badge */}
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-medium text-[var(--color-text-primary)]">
                {formatSwedishDate(call.called_at)}
              </span>
              {badge && (
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2 py-px text-[10px] font-semibold",
                    badge.className,
                  )}
                >
                  {badge.label}
                </span>
              )}
            </div>

            {/* Meta row: agent name, phone (omitted — not in CallLog), duration */}
            <div className="flex items-center gap-2 text-[11px]">
              {call.user_name && (
                <span className="font-bold text-[var(--color-text-primary)]">
                  {call.user_name}
                </span>
              )}
              <span className="font-mono text-[var(--color-text-secondary)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {formatDuration(call.duration)}
              </span>
            </div>

            {/* Recording */}
            {call.has_recording && call.phone_call_id && (
              <div className="rounded-lg border border-[#C7D2FE] bg-[#EEF2FF] px-3 py-2">
                <RecordingPlayer phoneCallId={call.phone_call_id} />
              </div>
            )}

            {/* Notes */}
            {call.notes && (
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-panel)] px-3 py-2 text-[12px] text-[var(--color-text-primary)]">
                {call.notes}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
