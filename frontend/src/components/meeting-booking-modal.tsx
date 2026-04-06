import { useState, useEffect } from "react";
import type { Lead } from "@/api/types";
import { useSubmitOutcome } from "@/api/leads";
import { TimeSelect } from "@/components/ui/time-select";
import { Button } from "@/components/ui/button";
import { formatDate, formatPhone } from "@/lib/format";
import { todayISO } from "@/lib/date";

interface MeetingBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBooked: () => void;
  lead: Lead;
  leadId: string;
  msConnected: boolean;
  callDuration?: number;
}

export function MeetingBookingModal({
  isOpen,
  onClose,
  onBooked,
  lead,
  leadId,
  msConnected,
  callDuration,
}: MeetingBookingModalProps) {
  const submitOutcome = useSubmitOutcome(leadId);

  const [title, setTitle] = useState(`Möte med ${lead.företag}`);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState<30 | 45 | 60>(30);
  const [customerEmail, setCustomerEmail] = useState(lead.epost ?? "");
  const [customerName, setCustomerName] = useState(lead.vd_namn ?? "");
  const [notes, setNotes] = useState("");
  const [sendTeams, setSendTeams] = useState(msConnected);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens with new lead
  useEffect(() => {
    if (isOpen) {
      setTitle(`Möte med ${lead.företag}`);
      setDate("");
      setTime("");
      setDuration(30);
      setCustomerEmail(lead.epost ?? "");
      setCustomerName(lead.vd_namn ?? "");
      setNotes("");
      setSendTeams(msConnected);
      setError(null);
    }
  }, [isOpen, lead.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  function handleSubmit() {
    setError(null);

    if (!date || !time) {
      setError("Välj datum och tid för mötet.");
      return;
    }
    if (date < todayISO()) {
      setError("Mötesdatumet kan inte vara i det förflutna.");
      return;
    }

    const params = {
      outcome: "meeting_booked" as const,
      title: title || undefined,
      meeting_date: date,
      meeting_time: time + ":00",
      meeting_duration: duration,
      meeting_notes: notes || undefined,
      customer_email: customerEmail || undefined,
      customer_name: customerName || undefined,
      create_teams_meeting: sendTeams,
      duration: callDuration,
    };

    console.log("[MeetingModal] Submitting:", params);

    submitOutcome.mutate(params, {
      onSuccess: () => {
        console.log("[MeetingModal] Success!");
        onBooked();
        onClose();
      },
      onError: (err) => {
        console.error("[MeetingModal] Error:", err);
        setError(err.message ?? "Något gick fel.");
      },
    });
  }

  // Format preview date
  const previewDate = date ? formatDate(date) : "—";
  const previewTime = time || "—";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-lg w-full max-w-2xl mx-4 mt-[10vh] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Boka möte</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">{lead.företag}</p>
        </div>

        {/* Body: two columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6">
          {/* Left: Configuration */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-secondary)]">
                Titel
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={`Möte med ${lead.företag}`}
                className="flex w-full rounded-[6px] border border-[var(--color-border-input)] bg-white px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-[var(--color-accent)] transition-colors duration-150"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-secondary)]">
                Datum
              </label>
              <input
                type="date"
                value={date}
                min={todayISO()}
                onChange={(e) => setDate(e.target.value)}
                className="flex w-full rounded-[6px] border border-[var(--color-border-input)] bg-white px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-[var(--color-accent)] transition-colors duration-150"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-secondary)]">
                Tid
              </label>
              <TimeSelect value={time} onChange={setTime} disabled={submitOutcome.isPending} />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-secondary)]">
                Längd
              </label>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value) as 30 | 45 | 60)}
                className="flex w-full rounded-[6px] border border-[var(--color-border-input)] bg-white px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-[var(--color-accent)] transition-colors duration-150"
              >
                <option value={30}>30 min</option>
                <option value={45}>45 min</option>
                <option value={60}>60 min</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-secondary)]">
                Kundens e-post
              </label>
              <input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="namn@företag.se"
                className="flex w-full rounded-[6px] border border-[var(--color-border-input)] bg-white px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-[var(--color-accent)] transition-colors duration-150"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-secondary)]">
                Kundens namn
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Förnamn Efternamn"
                className="flex w-full rounded-[6px] border border-[var(--color-border-input)] bg-white px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-[var(--color-accent)] transition-colors duration-150"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-secondary)]">
                Anteckningar
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Valfria anteckningar..."
                className="flex w-full rounded-[6px] border border-[var(--color-border-input)] bg-white px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] resize-y focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] transition-colors duration-150"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sendTeams}
                onChange={(e) => setSendTeams(e.target.checked)}
                disabled={!msConnected}
                className="rounded border-[var(--color-border-input)] text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
              />
              <span className={`text-sm ${msConnected ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-secondary)]"}`}>
                Skicka Teams-inbjudan
                {!msConnected && <span className="text-xs ml-1">(Microsoft ej kopplad)</span>}
              </span>
            </label>
          </div>

          {/* Right: Preview */}
          <div className="bg-slate-50 border border-[var(--color-border)] rounded-lg p-5">
            <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-secondary)] mb-4">
              Mötesinbjudan
            </p>
            <div className="space-y-3">
              <p className="font-semibold text-[var(--color-text-primary)]">
                {title || `Möte med ${lead.företag}`}
              </p>
              <p className="text-sm text-[var(--color-text-primary)]">
                {previewDate}, kl {previewTime}
              </p>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Längd: {duration} minuter
              </p>

              {customerEmail && (
                <p className="text-sm text-[var(--color-text-secondary)]">
                  Till: {customerEmail}
                </p>
              )}

              <hr className="border-[var(--color-border)]" />

              <div className="space-y-1.5 text-sm text-[var(--color-text-secondary)]">
                <p>Företag: {lead.företag}</p>
                {lead.telefon && <p>Telefon: {formatPhone(lead.telefon)}</p>}
                {customerName && <p>VD: {customerName}</p>}
                {lead.bransch && <p>Bransch: {lead.bransch}</p>}
                {lead.stad && <p>Stad: {lead.stad}</p>}
              </div>

              {notes && (
                <>
                  <hr className="border-[var(--color-border)]" />
                  <div>
                    <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-1">Anteckningar:</p>
                    <p className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap">{notes}</p>
                  </div>
                </>
              )}

              {sendTeams && (
                <p className="text-xs text-purple-600 mt-2">
                  Teams-länk skapas vid bokning
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="px-6">
            <p className="text-sm text-[var(--color-danger)] bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[var(--color-border)]">
          <Button variant="secondary" onClick={onClose} disabled={submitOutcome.isPending}>
            Avbryt
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={submitOutcome.isPending}>
            {submitOutcome.isPending ? "Bokar..." : "Boka möte"}
          </Button>
        </div>
      </div>
    </div>
  );
}
