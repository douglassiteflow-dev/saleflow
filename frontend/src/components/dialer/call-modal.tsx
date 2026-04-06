import { useState, useEffect } from "react";
import { useSubmitOutcome } from "@/api/leads";
import { useHangup } from "@/api/telavox";
import { useMicrosoftStatus } from "@/api/microsoft";
import { MeetingBookingModal } from "@/components/meeting-booking-modal";
import { cn } from "@/lib/cn";
import type { Lead, Outcome } from "@/api/types";

const OUTCOMES: { outcome: Outcome; label: string; className: string }[] = [
  { outcome: "meeting_booked", label: "Möte bokat", className: "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100" },
  { outcome: "callback", label: "Återuppringning", className: "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100" },
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

interface CallModalProps {
  lead: Lead;
  leadId: string;
  onClose: () => void;
}

export function CallModal({ lead, leadId, onClose }: CallModalProps) {
  const hangup = useHangup();
  const submitOutcome = useSubmitOutcome(leadId);
  const { data: msStatus } = useMicrosoftStatus();

  const [callStart] = useState(() => Date.now());
  const [seconds, setSeconds] = useState(0);
  const [hungUp, setHungUp] = useState(false);
  const [duration, setDuration] = useState(0);
  const [notes, setNotes] = useState("");
  const [callbackDate, setCallbackDate] = useState("");
  const [meetingModalOpen, setMeetingModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Timer
  useEffect(() => {
    if (hungUp) return;
    const interval = setInterval(() => {
      setSeconds(Math.floor((Date.now() - callStart) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [callStart, hungUp]);

  function handleHangup() {
    const dur = Math.floor((Date.now() - callStart) / 1000);
    setDuration(dur);
    setHungUp(true);
    hangup.mutate();
  }

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
        callback_at: outcome === "callback" && callbackDate ? callbackDate : undefined,
      },
      {
        onSuccess: () => onClose(),
        onError: (err) => setError(err.message ?? "Något gick fel."),
      },
    );
  }

  function handleMeetingBooked() {
    onClose();
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
        <div className="w-full max-w-lg rounded-[14px] bg-white shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>

          {/* Header */}
          <div className="px-6 py-4" style={{ background: "linear-gradient(135deg, #312E81, #4F46E5, #6366F1)" }}>
            <p className="text-white/60 text-[11px] uppercase tracking-wider mb-1">Samtal med</p>
            <p className="text-white text-lg font-medium">{lead.företag}</p>
            <p className="text-white/70 text-sm font-mono">{lead.telefon}</p>
          </div>

          {/* Timer + Hangup */}
          <div className="px-6 py-5 flex items-center justify-between border-b border-[var(--color-border)]">
            <div className="flex items-center gap-3">
              {!hungUp && (
                <span className="inline-block w-3 h-3 rounded-full bg-red-500 animate-pulse" />
              )}
              <span className={cn(
                "font-mono text-2xl font-light",
                hungUp ? "text-[var(--color-text-secondary)]" : "text-[var(--color-text-primary)]"
              )}>
                {formatTimer(hungUp ? duration : seconds)}
              </span>
              {hungUp && (
                <span className="text-[12px] text-[var(--color-text-secondary)] bg-slate-100 px-2 py-0.5 rounded">
                  Avslutat
                </span>
              )}
            </div>

            {!hungUp && (
              <button
                type="button"
                onClick={handleHangup}
                disabled={hangup.isPending}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
                {hangup.isPending ? "Lägger på..." : "Lägg på"}
              </button>
            )}
          </div>

          {/* Outcome section — only after hangup */}
          {hungUp && (
            <div className="px-6 py-5">
              <p className="text-[11px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)] mb-3">
                Välj utfall
              </p>

              <div className="grid grid-cols-2 gap-2 mb-4">
                {OUTCOMES.map((cfg) => (
                  <button
                    key={cfg.outcome}
                    type="button"
                    onClick={() => handleOutcome(cfg.outcome)}
                    disabled={submitOutcome.isPending}
                    className={cn(
                      "rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer",
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
                className="w-full rounded-lg border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 resize-none mb-3"
              />

              {/* Callback date picker — only when callback might be selected */}
              <div className="flex items-center gap-2 text-[12px] text-[var(--color-text-secondary)]">
                <label>Återuppringning:</label>
                <input
                  type="datetime-local"
                  value={callbackDate}
                  onChange={(e) => setCallbackDate(e.target.value)}
                  className="rounded border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-2 py-1 text-[12px]"
                />
              </div>

              {error && (
                <p className="mt-2 text-sm text-red-600">{error}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {meetingModalOpen && (
        <MeetingBookingModal
          isOpen={meetingModalOpen}
          leadId={leadId}
          lead={lead}
          msConnected={msStatus?.connected ?? false}
          callDuration={duration}
          onClose={() => setMeetingModalOpen(false)}
          onBooked={handleMeetingBooked}
        />
      )}
    </>
  );
}
