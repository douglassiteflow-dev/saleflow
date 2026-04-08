import { useState } from "react";
import { phoneMatches } from "@/lib/phone";
import { formatDateTime, formatDuration } from "@/lib/format";
import { OUTCOME_LABELS, OUTCOME_COLORS } from "@/lib/constants";
import { cn } from "@/lib/cn";
import { TabToolbar, usePagination, type DateRange } from "@/components/dialer/tab-toolbar";
import { RecordingPlayer } from "@/components/recording-player";
import { CallAnalysisModal, ScoreStars } from "@/components/call-analysis-modal";
import type { Analysis } from "@/components/call-analysis-modal";
import { useCallHistory } from "@/api/calls";
import { useMe } from "@/api/auth";
import { todayISO } from "@/lib/date";
import Loader from "@/components/kokonutui/loader";

interface HistoryTabProps {
  dateRange: DateRange;
  onDateRangeChange: (r: DateRange) => void;
  activePreset?: string | null;
  onPresetChange?: (label: string) => void;
  onLeadClick: (leadId: string) => void;
  onPlayRecording?: (url: string) => void;
}

export function HistoryTab({
  dateRange,
  onDateRangeChange,
  activePreset,
  onPresetChange,
  onLeadClick,
  onPlayRecording: _onPlayRecording,
}: HistoryTabProps) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [outcomeFilter, setOutcomeFilter] = useState("");
  const [analysisModal, setAnalysisModal] = useState<{ analysis: Analysis; companyName?: string } | null>(null);
  const { data: user } = useMe();
  const { data: calls, isLoading } = useCallHistory(dateRange.from, dateRange.to);
  const isAdmin = user?.role === "admin";

  const outcomeFiltered = outcomeFilter
    ? (calls ?? []).filter((c) => c.outcome === outcomeFilter)
    : (calls ?? []);

  const { totalPages, totalCount, paginate } = usePagination(outcomeFiltered, search, (call, q) =>
    (call.lead_name ?? "").toLowerCase().includes(q) || phoneMatches(call.lead_phone, q),
  );
  const visible = paginate(page);
  const headers = ["Tid", "Företag", "Telefon", ...(isAdmin ? ["Agent"] : []), "Längd", "Utfall", "Inspelning", "Betyg"];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <TabToolbar
        title="Samtalshistorik"
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        searchPlaceholder="Sök företag..."
        dateRange={dateRange}
        onDateRangeChange={(r) => { onDateRangeChange(r); setPage(1); }}
        activePreset={activePreset}
        onPresetChange={onPresetChange}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        totalCount={totalCount}
      />
      {/* Outcome filter */}
      <div className="flex items-center gap-1.5 px-5 py-1.5 border-b border-[var(--color-border)] bg-[var(--color-bg-primary)]">
        <span className="text-[10px] text-[var(--color-text-secondary)]">Utfall:</span>
        {[
          { value: "", label: "Alla" },
          { value: "meeting_booked", label: "Möte" },
          { value: "callback", label: "Callback" },
          { value: "not_interested", label: "Ej intresserad" },
          { value: "no_answer", label: "Ej svar" },
          { value: "bad_number", label: "Fel nr" },
        ].map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => { setOutcomeFilter(o.value); setPage(1); }}
            className={cn(
              "px-2 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer",
              outcomeFilter === o.value
                ? "bg-[var(--color-accent)] text-white"
                : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-panel)]",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-5"><Loader size="sm" title="Laddar samtal..." /></div>
        ) : visible.length === 0 ? (
          <p className="p-5 text-sm text-[var(--color-text-secondary)]">
            Inga samtal {dateRange.from === todayISO() ? "idag" : `den ${dateRange.from}`}.
          </p>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-[var(--color-bg-panel)]">
                {headers.map((h) => (
                  <th key={h} className="px-5 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((call) => (
                <tr key={call.id} className={`border-t border-[var(--color-border)] transition-colors hover:bg-[var(--color-bg-panel)] ${call.lead_id ? "cursor-pointer" : ""}`} onClick={() => call.lead_id && onLeadClick(call.lead_id)}>
                  <td className="whitespace-nowrap px-5 py-2.5 font-mono text-xs text-[var(--color-text-secondary)]">{formatDateTime(call.called_at)}</td>
                  <td className="px-5 py-2.5 font-medium text-[var(--color-text-primary)]">{call.lead_name ?? "Okänt företag"}</td>
                  <td className="px-5 py-2.5 font-mono text-xs text-[var(--color-text-secondary)]">{call.lead_phone ?? "—"}</td>
                  {isAdmin && <td className="px-5 py-2.5 font-medium text-[var(--color-accent)]">{call.user_name ?? "—"}</td>}
                  <td className="px-5 py-2.5 text-[var(--color-text-secondary)]">{formatDuration(call.duration)}</td>
                  <td className="px-5 py-2.5">
                    {call.outcome ? (
                      <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px]", OUTCOME_COLORS[call.outcome] ?? "bg-[var(--color-bg-panel)] text-[var(--color-text-secondary)] border-[var(--color-border)]")}>{OUTCOME_LABELS[call.outcome] ?? call.outcome}</span>
                    ) : <span className="text-[var(--color-text-secondary)]">—</span>}
                  </td>
                  <td className="px-5 py-2.5" onClick={(e) => e.stopPropagation()}>
                    {call.has_recording && (call.phone_call_id || call.id) ? (
                      <RecordingPlayer phoneCallId={call.phone_call_id ?? call.id} />
                    ) : (
                      <span className="text-[var(--color-text-secondary)]">—</span>
                    )}
                  </td>
                  <td className="px-5 py-2.5" onClick={(e) => e.stopPropagation()}>
                    {call.transcription_analysis ? (
                      <ScoreStars
                        score={(() => { try { const p = JSON.parse(call.transcription_analysis); const s = p.score?.overall ?? (p.raw_analysis ? JSON.parse(p.raw_analysis.replace(/```json\n?|\n?```/g, "")).score?.overall : 0); return s ?? 0; } catch { return 0; } })()}
                        onClick={() => {
                          try {
                            const p = JSON.parse(call.transcription_analysis!);
                            const analysis: Analysis = p.raw_analysis ? JSON.parse(p.raw_analysis.replace(/```json\n?|\n?```/g, "")) : p;
                            setAnalysisModal({ analysis, companyName: call.lead_name ?? undefined });
                          } catch { /* ignore */ }
                        }}
                      />
                    ) : (
                      <span className="text-[var(--color-text-secondary)]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {analysisModal && (
        <CallAnalysisModal
          analysis={analysisModal.analysis}
          companyName={analysisModal.companyName}
          onClose={() => setAnalysisModal(null)}
        />
      )}
    </div>
  );
}

