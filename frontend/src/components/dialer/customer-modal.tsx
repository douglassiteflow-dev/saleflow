import { useState, useEffect } from "react";
import { useLeadDetail, useSubmitOutcome } from "@/api/leads";
import { useDial } from "@/api/telavox";
import { useMicrosoftStatus } from "@/api/microsoft";
import { BookingWizard } from "@/components/dialer/booking-wizard";
import { CustomerModalInfo } from "@/components/dialer/customer-modal-info";
import { CustomerModalHistory } from "@/components/dialer/customer-modal-history";
import { cn } from "@/lib/cn";
import type { Outcome } from "@/api/types";

const OUTCOMES: { outcome: Outcome; label: string; className: string }[] = [
  { outcome: "meeting_booked", label: "Möte bokat", className: "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100" },
  { outcome: "callback", label: "Återringning", className: "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100" },
  { outcome: "not_interested", label: "Ej intresserad", className: "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100" },
  { outcome: "no_answer", label: "Ej svar", className: "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100" },
  { outcome: "call_later", label: "Ring senare", className: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100" },
  { outcome: "bad_number", label: "Fel nummer", className: "border-red-200 bg-red-50 text-red-700 hover:bg-red-100" },
];

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type ModalTab = "info" | "history";

interface CustomerModalProps {
  leadId: string;
  phoneNumber: string;
  callStart: number;
  hungUp: boolean;
  duration: number;
  onHangup: () => void;
  onOutcomeSubmitted: () => void;
}

export function CustomerModal({
  leadId,
  phoneNumber,
  callStart,
  hungUp,
  duration,
  onHangup,
  onOutcomeSubmitted,
}: CustomerModalProps) {
  const { data } = useLeadDetail(leadId);
  const submitOutcome = useSubmitOutcome(leadId);
  const dialMutation = useDial();
  const { data: msStatus } = useMicrosoftStatus();

  const [seconds, setSeconds] = useState(0);
  const [notes, setNotes] = useState("");
  const [activeTab, setActiveTab] = useState<ModalTab>("info");
  const [meetingModalOpen, setMeetingModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lead = data?.lead;
  const calls = data?.calls ?? [];

  // Timer
  useEffect(() => {
    if (hungUp) return;
    const interval = setInterval(() => {
      setSeconds(Math.floor((Date.now() - callStart) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [callStart, hungUp]);

  function handleOutcome(outcome: Outcome) {
    if (outcome === "meeting_booked") {
      setMeetingModalOpen(true);
      return;
    }

    setError(null);
    submitOutcome.mutate(
      {
        outcome,
        notes: notes || undefined,
        duration,
      },
      {
        onSuccess: () => onOutcomeSubmitted(),
        onError: (err) => setError(err.message ?? "Något gick fel."),
      },
    );
  }

  function handleMeetingBooked() {
    onOutcomeSubmitted();
  }

  function handleDial(_number: string) {
    dialMutation.mutate(leadId);
  }

  // Build quick link URLs
  const mapsQuery = lead
    ? [lead.adress, lead.postnummer, lead.stad].filter(Boolean).join(" ")
    : "";
  const googleUrl = lead
    ? `https://www.google.com/search?q=${encodeURIComponent(lead.företag + " " + (lead.stad ?? ""))}`
    : "#";
  const mapsUrl = mapsQuery
    ? `https://www.google.com/maps/search/${encodeURIComponent(mapsQuery)}`
    : "#";
  const allabolagUrl = lead
    ? lead.orgnr
      ? `https://www.allabolag.se/${lead.orgnr}`
      : `https://www.allabolag.se/what/${encodeURIComponent(lead.företag)}`
    : "#";
  const eniroUrl = lead
    ? `https://www.eniro.se/s/${encodeURIComponent(lead.företag)}`
    : "#";

  // Subtitle parts
  const subtitleParts = lead
    ? [lead.bransch, lead.adress, lead.orgnr].filter(Boolean)
    : [];
  const subtitle = subtitleParts.join(" \u00b7 ");

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
        <div className="w-full max-w-[920px] rounded-[14px] bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>

          {/* 1. Header */}
          <div className="px-6 py-4" style={{ background: "linear-gradient(135deg, #312E81, #4F46E5, #6366F1)" }}>
            <p className="text-white text-[18px] font-bold">{lead?.företag ?? "..."}</p>
            {subtitle && (
              <p className="text-white/70 text-[12px]">{subtitle}</p>
            )}
          </div>

          {/* 2. Call bar */}
          {!hungUp && (
            <div className="px-6 py-4 flex items-center justify-between bg-[var(--color-bg-panel)]">
              <div className="flex items-center gap-3">
                <span className="inline-block w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                <span className="font-mono text-[14px] text-[var(--color-text-primary)]">{phoneNumber}</span>
                <span className="font-mono text-[20px] font-light text-[var(--color-text-primary)]">
                  {formatTimer(seconds)}
                </span>
                <span className="text-[12px] text-[var(--color-text-secondary)]">Pågående samtal</span>
              </div>
              <button
                type="button"
                onClick={onHangup}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
                Lägg på
              </button>
            </div>
          )}

          {/* 3. Quick links */}
          <div className="px-6 py-2 flex flex-wrap gap-1">
            <a href={googleUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 rounded border border-[var(--color-border)] px-2 py-[3px] text-[11px] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-panel)] transition-colors no-underline">
              Google ↗
            </a>
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 rounded border border-[var(--color-border)] px-2 py-[3px] text-[11px] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-panel)] transition-colors no-underline">
              Maps ↗
            </a>
            <a href={allabolagUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 rounded border border-[var(--color-border)] px-2 py-[3px] text-[11px] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-panel)] transition-colors no-underline">
              Allabolag ↗
            </a>
            <a href={eniroUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 rounded border border-[var(--color-border)] px-2 py-[3px] text-[11px] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-panel)] transition-colors no-underline">
              Eniro ↗
            </a>
          </div>

          {/* 4. Tabs */}
          <div className="flex border-b border-[var(--color-border)] bg-[var(--color-bg-primary)]">
            <button
              type="button"
              onClick={() => setActiveTab("info")}
              className={cn(
                "px-[22px] py-[11px] text-[13px] font-medium -mb-px cursor-pointer transition-colors",
                activeTab === "info"
                  ? "text-[var(--color-accent)] border-b-2 border-[var(--color-accent)]"
                  : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
              )}
            >
              Kundinfo
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("history")}
              className={cn(
                "px-[22px] py-[11px] text-[13px] font-medium -mb-px cursor-pointer transition-colors",
                activeTab === "history"
                  ? "text-[var(--color-accent)] border-b-2 border-[var(--color-accent)]"
                  : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
              )}
            >
              Historik
              {calls.length > 0 && (
                <span className="ml-1 inline-flex items-center rounded-full bg-indigo-50 px-[7px] py-px text-[10px] font-semibold text-indigo-800 border border-indigo-200">
                  {calls.length}
                </span>
              )}
            </button>
          </div>

          {/* 5. Tab content */}
          <div className="flex-1 overflow-auto">
            {activeTab === "info" && lead && (
              <CustomerModalInfo lead={lead} leadId={leadId} onDial={handleDial} activePhoneNumber={phoneNumber} />
            )}
            {activeTab === "history" && <CustomerModalHistory calls={calls} />}
          </div>

          {/* 6. Outcome section — only after hangup */}
          {hungUp && (
            <div className="px-6 py-4 border-t border-[var(--color-border)]">
              <p className="text-[11px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)] mb-3">
                Välj utfall
              </p>
              <div className="flex gap-2 mb-3">
                {OUTCOMES.map((cfg) => (
                  <button
                    key={cfg.outcome}
                    type="button"
                    onClick={() => handleOutcome(cfg.outcome)}
                    disabled={submitOutcome.isPending}
                    className={cn(
                      "flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer",
                      "disabled:opacity-50 disabled:pointer-events-none",
                      cfg.className,
                    )}
                  >
                    {cfg.label}
                  </button>
                ))}
              </div>

              {/* Notes */}
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anteckningar (valfritt)..."
                rows={2}
                className="w-full rounded-lg border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 resize-none"
              />

              {error && (
                <p className="mt-2 text-sm text-red-600">{error}</p>
              )}
            </div>
          )}

          {/* 7. Footer */}
          <div className="px-6 py-2 border-t border-[var(--color-border)] flex items-center justify-between">
            <span className="text-[11px] text-[var(--color-text-secondary)]">
              Stängs bara via utfall
            </span>
            {lead?.imported_at && (
              <span className="text-[11px] text-[var(--color-text-secondary)]">
                Importerad {new Date(lead.imported_at).toLocaleDateString("sv-SE")}
                {lead.källa ? ` via ${lead.källa}` : ""}
              </span>
            )}
          </div>
        </div>
      </div>

      {meetingModalOpen && lead && (
        <BookingWizard
          isOpen={meetingModalOpen}
          leadId={leadId}
          lead={lead}
          isMsConnected={msStatus?.connected ?? false}
          onClose={() => setMeetingModalOpen(false)}
          onSuccess={handleMeetingBooked}
        />
      )}
    </>
  );
}
