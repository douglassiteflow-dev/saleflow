import { useState } from "react";
import type { Outcome } from "@/api/types";
import { useSubmitOutcome } from "@/api/leads";
import { Card, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/cn";

interface OutcomeConfig {
  outcome: Outcome;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  hoverBg: string;
}

const OUTCOMES: OutcomeConfig[] = [
  {
    outcome: "meeting_booked",
    label: "Möte bokat",
    color: "#059669",
    bgColor: "#ECFDF5",
    borderColor: "#A7F3D0",
    hoverBg: "#D1FAE5",
  },
  {
    outcome: "callback",
    label: "Återuppringning",
    color: "#D97706",
    bgColor: "#FFFBEB",
    borderColor: "#FDE68A",
    hoverBg: "#FEF3C7",
  },
  {
    outcome: "not_interested",
    label: "Inte intresserad",
    color: "#DC2626",
    bgColor: "#FEF2F2",
    borderColor: "#FECACA",
    hoverBg: "#FEE2E2",
  },
  {
    outcome: "no_answer",
    label: "Svarar ej",
    color: "#64748B",
    bgColor: "#F8FAFC",
    borderColor: "#CBD5E1",
    hoverBg: "#F1F5F9",
  },
  {
    outcome: "bad_number",
    label: "Fel nummer",
    color: "#1E293B",
    bgColor: "#F1F5F9",
    borderColor: "#94A3B8",
    hoverBg: "#E2E8F0",
  },
  {
    outcome: "customer",
    label: "Kund",
    color: "#4F46E5",
    bgColor: "#EEF2FF",
    borderColor: "#C7D2FE",
    hoverBg: "#E0E7FF",
  },
];

interface OutcomePanelProps {
  leadId: string;
  onOutcomeSubmitted?: () => void;
}

export function OutcomePanel({ leadId, onOutcomeSubmitted }: OutcomePanelProps) {
  const submitOutcome = useSubmitOutcome(leadId);

  const [selected, setSelected] = useState<Outcome | null>(null);
  const [notes, setNotes] = useState("");
  const [callbackDate, setCallbackDate] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [meetingTime, setMeetingTime] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSelect(outcome: Outcome) {
    if (selected === outcome) {
      // Second click — confirm/submit
      handleSubmit(outcome);
    } else {
      setSelected(outcome);
      setError(null);
    }
  }

  function handleSubmit(outcome: Outcome) {
    setError(null);

    // Validation
    if (outcome === "meeting_booked") {
      if (!meetingDate || !meetingTime) {
        setError("Välj datum och tid för mötet.");
        return;
      }
    }

    if (submitOutcome.isPending) return;

    submitOutcome.mutate(
      {
        outcome,
        notes: notes || undefined,
        meeting_date: outcome === "meeting_booked" ? meetingDate : undefined,
        meeting_time: outcome === "meeting_booked" ? meetingTime : undefined,
        callback_at:
          outcome === "callback" && callbackDate
            ? callbackDate
            : undefined,
      },
      {
        onSuccess: () => {
          // Reset state
          setSelected(null);
          setNotes("");
          setCallbackDate("");
          setMeetingDate("");
          setMeetingTime("");
          setError(null);
          onOutcomeSubmitted?.();
        },
        onError: (err) => {
          setError(err.message ?? "Något gick fel.");
        },
      },
    );
  }

  return (
    <Card>
      <CardTitle className="mb-4">Utfall</CardTitle>

      {/* 2-column grid of outcome buttons */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        {OUTCOMES.map((cfg) => {
          const isSelected = selected === cfg.outcome;
          return (
            <button
              key={cfg.outcome}
              type="button"
              disabled={submitOutcome.isPending}
              onClick={() => handleSelect(cfg.outcome)}
              className={cn(
                "flex items-center justify-center rounded-md border-2 px-3 py-2.5 text-sm font-medium transition-all duration-150 cursor-pointer",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
                "disabled:pointer-events-none disabled:opacity-50",
                isSelected
                  ? "ring-2 ring-offset-1 shadow-sm"
                  : "hover:shadow-sm",
              )}
              style={{
                borderColor: isSelected ? cfg.color : cfg.borderColor,
                backgroundColor: isSelected ? cfg.bgColor : "#FFFFFF",
                color: cfg.color,
                ...(isSelected ? { ringColor: cfg.color } : {}),
              }}
            >
              {isSelected ? `Bekräfta: ${cfg.label}` : cfg.label}
            </button>
          );
        })}
      </div>

      {/* Conditional fields */}
      {selected === "callback" && (
        <div className="mb-4 space-y-2">
          <label className="block text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-secondary)]">
            Datum för återuppringning
          </label>
          <input
            type="datetime-local"
            value={callbackDate}
            onChange={(e) => setCallbackDate(e.target.value)}
            className="flex w-full rounded-md border border-[var(--color-border-input)] bg-white px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          />
        </div>
      )}

      {selected === "meeting_booked" && (
        <div className="mb-4 space-y-3">
          <div className="space-y-1.5">
            <label className="block text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-secondary)]">
              Mötesdatum
            </label>
            <input
              type="date"
              value={meetingDate}
              onChange={(e) => setMeetingDate(e.target.value)}
              required
              className="flex w-full rounded-md border border-[var(--color-border-input)] bg-white px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-secondary)]">
              Mötestid
            </label>
            <input
              type="time"
              value={meetingTime}
              onChange={(e) => setMeetingTime(e.target.value)}
              required
              className="flex w-full rounded-md border border-[var(--color-border-input)] bg-white px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
          </div>
        </div>
      )}

      {/* Notes */}
      <div className="mb-4 space-y-1.5">
        <label className="block text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-secondary)]">
          Anteckningar
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Valfria anteckningar..."
          className="flex w-full rounded-md border border-[var(--color-border-input)] bg-white px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] resize-y focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        />
      </div>

      {/* Error */}
      {error && (
        <p className="mb-3 text-sm text-[var(--color-danger)] bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      {/* Hint when nothing selected */}
      {!selected && (
        <p className="text-sm text-[var(--color-text-secondary)] text-center">
          Välj ett utfall ovan — klicka igen för att bekräfta.
        </p>
      )}
    </Card>
  );
}
