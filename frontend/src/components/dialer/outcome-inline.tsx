import { useState } from "react";
import type { Lead, Outcome } from "@/api/types";
import { useSubmitOutcome } from "@/api/leads";
import { useMicrosoftStatus } from "@/api/microsoft";
import { MeetingBookingModal } from "@/components/meeting-booking-modal";
import { cn } from "@/lib/cn";

interface OutcomeConfig {
  outcome: Outcome;
  label: string;
  className: string;
}

const OUTCOMES: OutcomeConfig[] = [
  {
    outcome: "meeting_booked",
    label: "Möte bokat",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  {
    outcome: "callback",
    label: "Återuppringning",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  {
    outcome: "not_interested",
    label: "Ej intresserad",
    className:
      "border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)]",
  },
  {
    outcome: "no_answer",
    label: "Ej svar",
    className:
      "border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)]",
  },
  {
    outcome: "call_later",
    label: "Ring senare",
    className:
      "border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)]",
  },
  {
    outcome: "bad_number",
    label: "Fel nummer",
    className:
      "border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)]",
  },
];

interface OutcomeInlineProps {
  leadId: string;
  companyName: string;
  leadData: Lead;
  onOutcomeSubmitted: () => void;
}

export function OutcomeInline({
  leadId,
  companyName: _companyName,
  leadData,
  onOutcomeSubmitted,
}: OutcomeInlineProps) {
  const submitOutcome = useSubmitOutcome(leadId);
  const { data: msStatus } = useMicrosoftStatus();

  const [selected, setSelected] = useState<Outcome | null>(null);
  const [notes, setNotes] = useState("");
  const [callbackDate, setCallbackDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [meetingModalOpen, setMeetingModalOpen] = useState(false);

  function handleSelect(outcome: Outcome) {
    if (outcome === "meeting_booked") {
      setMeetingModalOpen(true);
      return;
    }

    if (selected !== outcome) {
      setSelected(outcome);
      setError(null);
    } else {
      handleSubmit(outcome);
    }
  }

  function handleSubmit(outcome: Outcome) {
    if (submitOutcome.isPending) return;
    setError(null);

    submitOutcome.mutate(
      {
        outcome,
        notes: notes || undefined,
        callback_at:
          outcome === "callback" && callbackDate ? callbackDate : undefined,
      },
      {
        onSuccess: () => {
          setSelected(null);
          setNotes("");
          setCallbackDate("");
          setError(null);
          onOutcomeSubmitted();
        },
        onError: (err) => {
          setError(err.message ?? "Nagot gick fel.");
        },
      },
    );
  }

  function handleMeetingBooked() {
    setSelected(null);
    setNotes("");
    setError(null);
    onOutcomeSubmitted();
  }

  return (
    <>
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)] mb-3.5">
          Utfall
        </p>

        {/* 2x3 outcome buttons */}
        <div className="grid grid-cols-2 gap-2 mb-5">
          {OUTCOMES.map((cfg) => {
            const isSelected = selected === cfg.outcome;
            return (
              <button
                key={cfg.outcome}
                type="button"
                disabled={submitOutcome.isPending}
                onClick={() => handleSelect(cfg.outcome)}
                className={cn(
                  "rounded-lg border px-2.5 py-2.5 text-xs font-medium cursor-pointer transition-all",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[var(--color-accent)]",
                  "disabled:pointer-events-none disabled:opacity-50",
                  cfg.className,
                  isSelected && "ring-2 ring-offset-1 shadow-sm",
                )}
              >
                {isSelected ? `Bekrafta: ${cfg.label}` : cfg.label}
              </button>
            );
          })}
        </div>

        {/* Callback date picker */}
        {selected === "callback" && (
          <div className="mb-4 space-y-2">
            <label className="block text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-secondary)]">
              Datum for ateruppringning
            </label>
            <button
              type="button"
              onClick={() => {
                const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
                const pad = (n: number) => String(n).padStart(2, "0");
                setCallbackDate(
                  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
                );
              }}
              className="w-full rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 transition-colors mb-2"
            >
              Om 24 timmar
            </button>
            <input
              type="datetime-local"
              value={callbackDate}
              onChange={(e) => setCallbackDate(e.target.value)}
              className="flex w-full rounded-md border border-[var(--color-border-input)] bg-white px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
          </div>
        )}

        {/* Notes textarea */}
        <p className="text-[11px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)] mb-2">
          Anteckningar
        </p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Skriv anteckning..."
          className={cn(
            "w-full rounded-lg border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-2.5 py-2.5",
            "text-[13px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)]",
            "font-[inherit] resize-y focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]",
          )}
        />

        {/* Error */}
        {error && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        {/* Hint when nothing selected */}
        {!selected && (
          <p className="mt-3 text-xs text-[var(--color-text-secondary)] text-center">
            Välj ett utfall ovan — klicka igen för att bekräfta.
          </p>
        )}
      </div>

      {/* Meeting booking modal */}
      <MeetingBookingModal
        isOpen={meetingModalOpen}
        onClose={() => setMeetingModalOpen(false)}
        onBooked={handleMeetingBooked}
        lead={leadData}
        leadId={leadId}
        msConnected={msStatus?.connected ?? false}
      />
    </>
  );
}
