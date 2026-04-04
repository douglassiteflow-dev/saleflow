import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCallHistory } from "@/api/calls";
import { useMe } from "@/api/auth";
import { formatDateTime } from "@/lib/format";
import Loader from "@/components/kokonutui/loader";

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

const OUTCOME_COLORS: Record<string, string> = {
  meeting_booked: "bg-emerald-100 text-emerald-700",
  callback: "bg-amber-100 text-amber-700",
  not_interested: "bg-rose-100 text-rose-700",
  no_answer: "bg-slate-100 text-slate-600",
  call_later: "bg-blue-100 text-blue-700",
  bad_number: "bg-red-100 text-red-700",
  customer: "bg-indigo-100 text-indigo-700",
  other: "bg-slate-100 text-slate-600",
};

function formatDuration(seconds: number): string {
  if (seconds === 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function HistoryPage() {
  const [date, setDate] = useState(todayISO);
  const navigate = useNavigate();
  const { data: user } = useMe();
  const { data: calls, isLoading } = useCallHistory(date);
  const isAdmin = user?.role === "admin";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-light tracking-[-0.5px] text-[var(--color-text-primary)]">
          Samtalshistorik
        </h1>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-9 rounded-[10px] border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-3 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
        />
      </div>

      <div className="overflow-hidden rounded-[14px] bg-[var(--color-bg-primary)] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        {isLoading ? (
          <div className="p-[var(--spacing-card)]">
            <Loader size="sm" title="Laddar samtal..." />
          </div>
        ) : !calls || calls.length === 0 ? (
          <p className="p-[var(--spacing-card)] text-sm text-[var(--color-text-secondary)]">
            Inga samtal {date === todayISO() ? "idag" : `den ${date}`}.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
                    Tid
                  </th>
                  <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
                    Företag
                  </th>
                  <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
                    Telefon
                  </th>
                  {isAdmin && (
                    <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
                      Agent
                    </th>
                  )}
                  <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
                    Längd
                  </th>
                  <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
                    Utfall
                  </th>
                </tr>
              </thead>
              <tbody>
                {calls.map((call, i) => (
                  <tr
                    key={call.id}
                    onClick={() => call.lead_id && void navigate(`/leads/${call.lead_id}`)}
                    className={[
                      i !== calls.length - 1 ? "border-b border-[var(--color-border)]" : "",
                      call.lead_id ? "cursor-pointer transition-colors hover:bg-[var(--color-bg-panel)]" : "",
                    ].filter(Boolean).join(" ")}
                  >
                    <td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs text-[var(--color-text-secondary)]">
                      {formatDateTime(call.called_at)}
                    </td>
                    <td className="px-5 py-3.5 font-medium text-[var(--color-text-primary)]">
                      {call.lead_name ?? "Okänt företag"}
                    </td>
                    <td className="px-5 py-3.5 text-[var(--color-text-secondary)]">
                      {call.lead_phone ?? "—"}
                    </td>
                    {isAdmin && (
                      <td className="px-5 py-3.5 font-medium text-[var(--color-accent)]">
                        {call.user_name ?? "—"}
                      </td>
                    )}
                    <td className="px-5 py-3.5 text-[var(--color-text-secondary)]">
                      {formatDuration(call.duration)}
                    </td>
                    <td className="px-5 py-3.5">
                      {call.outcome ? (
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${OUTCOME_COLORS[call.outcome] ?? "bg-slate-100 text-slate-600"}`}>
                          {OUTCOME_LABELS[call.outcome] ?? call.outcome}
                        </span>
                      ) : (
                        <span className="text-[var(--color-text-secondary)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
