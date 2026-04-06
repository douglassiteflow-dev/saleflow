import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCallHistory } from "@/api/calls";
import { useMe } from "@/api/auth";
import { RecordingPlayer } from "@/components/recording-player";
import { CallAnalysisModal, ScoreStars } from "@/components/call-analysis-modal";
import { formatDateTime, formatDuration } from "@/lib/format";
import { todayISO, yesterdayISO, daysAgoISO, type DateRange } from "@/lib/date";
import { OUTCOME_LABELS, OUTCOME_COLORS } from "@/lib/constants";
import { cn } from "@/lib/cn";
import Loader from "@/components/kokonutui/loader";
import type { CallHistoryEntry } from "@/api/types";

const PRESETS: { label: string; get: () => DateRange }[] = [
  { label: "Idag", get: () => ({ from: todayISO(), to: todayISO() }) },
  { label: "Igår", get: () => ({ from: yesterdayISO(), to: yesterdayISO() }) },
  { label: "Senaste 7 dagarna", get: () => ({ from: daysAgoISO(6), to: todayISO() }) },
  { label: "Senaste 30 dagarna", get: () => ({ from: daysAgoISO(29), to: todayISO() }) },
];

export function HistoryPage() {
  const [dateRange, setDateRange] = useState<DateRange>(() => ({
    from: todayISO(),
    to: todayISO(),
  }));
  const [analysisCall, setAnalysisCall] = useState<CallHistoryEntry | null>(null);
  const [activePreset, setActivePreset] = useState<string | null>("Idag");
  const navigate = useNavigate();
  const { data: user } = useMe();
  const { data: calls, isLoading } = useCallHistory(dateRange.from, dateRange.to);
  const isAdmin = user?.role === "admin";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-light tracking-[-0.5px] text-[var(--color-text-primary)]">
          Samtalshistorik
        </h1>
      </div>

      {/* Presets + date range */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {PRESETS.map((p) => {
            const isActive = activePreset === p.label;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => { setDateRange(p.get()); setActivePreset(p.label); }}
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer",
                  isActive
                    ? "bg-[var(--color-accent)] text-white"
                    : "bg-[var(--color-bg-panel)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-primary)] border border-[var(--color-border)]",
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateRange.from}
            onChange={(e) => { setDateRange({ ...dateRange, from: e.target.value }); setActivePreset(null); }}
            className="h-9 rounded-[10px] border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-3 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
          />
          <span className="text-sm text-[var(--color-text-secondary)]">&ndash;</span>
          <input
            type="date"
            value={dateRange.to}
            onChange={(e) => { setDateRange({ ...dateRange, to: e.target.value }); setActivePreset(null); }}
            className="h-9 rounded-[10px] border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-3 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-[14px] bg-[var(--color-bg-primary)] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        {isLoading ? (
          <div className="p-[var(--spacing-card)]">
            <Loader size="sm" title="Laddar samtal..." />
          </div>
        ) : !calls || calls.length === 0 ? (
          <p className="p-[var(--spacing-card)] text-sm text-[var(--color-text-secondary)]">
            Inga samtal{" "}
            {dateRange.from === todayISO() && dateRange.to === todayISO()
              ? "idag"
              : dateRange.from === dateRange.to
                ? `den ${dateRange.from}`
                : `${dateRange.from} – ${dateRange.to}`}.
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
                  <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
                    Inspelning
                  </th>
                  <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
                    Betyg
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
                    <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                      {call.has_recording && (call.phone_call_id || call.id) ? (
                        <RecordingPlayer phoneCallId={call.phone_call_id ?? call.id} />
                      ) : (
                        <span className="text-[var(--color-text-secondary)]">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                      {call.transcription_analysis ? (
                        <ScoreStars
                          score={(() => { try { return JSON.parse(call.transcription_analysis).score?.overall ?? 0; } catch { return 0; } })()}
                          onClick={() => setAnalysisCall(call)}
                        />
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

      {analysisCall?.transcription_analysis && (
        <CallAnalysisModal
          analysis={(() => { try { const parsed = JSON.parse(analysisCall.transcription_analysis); return parsed.raw_analysis ? JSON.parse(parsed.raw_analysis.replace(/```json\n?|\n?```/g, "")) : parsed; } catch { return null; } })()}
          companyName={analysisCall.lead_name ?? undefined}
          onClose={() => setAnalysisCall(null)}
        />
      )}
    </div>
  );
}
