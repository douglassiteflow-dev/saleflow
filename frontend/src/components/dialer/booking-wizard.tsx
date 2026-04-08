import { useState, useEffect } from "react";
import type { Lead } from "@/api/types";
import { useSubmitOutcome } from "@/api/leads";
import { TimeSelect } from "@/components/ui/time-select";
import { Button } from "@/components/ui/button";
import { todayISO } from "@/lib/date";

interface BookingWizardProps {
  leadId: string;
  lead: Lead;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  isMsConnected: boolean;
}

type DemoSource = "bokadirekt" | "existing_website" | "manual" | null;

export function BookingWizard({
  leadId,
  lead,
  isOpen,
  onClose,
  onSuccess,
  isMsConnected,
}: BookingWizardProps) {
  const submitOutcome = useSubmitOutcome(leadId);

  // Step state
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1 fields
  const [title, setTitle] = useState(`Möte med ${lead.företag}`);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState<30 | 45 | 60>(30);
  const [customerEmail, setCustomerEmail] = useState(lead.epost ?? "");
  const [customerName, setCustomerName] = useState(lead.vd_namn ?? "");
  const [notes, setNotes] = useState("");
  const [sendTeams, setSendTeams] = useState(isMsConnected);

  // Step 2 fields
  const [hasBokadirekt, setHasBokadirekt] = useState<"yes" | "no" | null>(null);
  const [demoSource, setDemoSource] = useState<DemoSource>(null);
  const [bokadirektUrl, setBokadirektUrl] = useState("");
  const [existingWebsiteUrl, setExistingWebsiteUrl] = useState("");
  const [manualInfo, setManualInfo] = useState("");

  // Error state
  const [error, setError] = useState<string | null>(null);

  // Reset all state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setTitle(`Möte med ${lead.företag}`);
      setDate("");
      setTime("");
      setDuration(30);
      setCustomerEmail(lead.epost ?? "");
      setCustomerName(lead.vd_namn ?? "");
      setNotes("");
      setSendTeams(isMsConnected);
      setHasBokadirekt(null);
      setDemoSource(null);
      setBokadirektUrl("");
      setExistingWebsiteUrl("");
      setManualInfo("");
      setError(null);
    }
  }, [isOpen, lead.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  // Step 1 validation
  const step1Valid = !!date && !!time;

  // Step 2 validation
  function getSourceUrl(): string | undefined {
    if (hasBokadirekt === "yes") return bokadirektUrl || undefined;
    if (demoSource === "existing_website") return existingWebsiteUrl || undefined;
    if (demoSource === "manual") return manualInfo || undefined;
    return undefined;
  }

  function isStep2Valid(): boolean {
    if (hasBokadirekt === "yes") return !!bokadirektUrl.trim();
    if (hasBokadirekt === "no") {
      if (demoSource === "existing_website") return !!existingWebsiteUrl.trim();
      if (demoSource === "manual") return !!manualInfo.trim();
    }
    return false;
  }

  function handleNext() {
    if (!step1Valid) return;
    setError(null);
    setStep(2);
  }

  function handleBack() {
    setError(null);
    setStep(1);
  }

  function handleSubmit() {
    setError(null);

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
      source_url: getSourceUrl(),
    };

    submitOutcome.mutate(params, {
      onSuccess: () => {
        onSuccess();
        onClose();
      },
      onError: (err) => {
        setError((err as Error).message ?? "Något gick fel.");
      },
    });
  }

  const inputClass =
    "flex w-full rounded-[6px] border border-[var(--color-border-input)] bg-white px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-[var(--color-accent)] transition-colors duration-150";

  const labelClass =
    "block text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-secondary)]";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg w-full max-w-xl mx-4 mt-[8vh] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
                Boka möte
              </h2>
              <p className="text-sm text-[var(--color-text-secondary)]">{lead.företag}</p>
            </div>
            <span className="text-xs font-medium text-[var(--color-text-secondary)] bg-slate-100 px-3 py-1 rounded-full">
              Steg {step} av 2
            </span>
          </div>

          {/* Step indicator bar */}
          <div className="mt-3 flex gap-1.5">
            <div className="h-1 flex-1 rounded-full bg-[var(--color-accent)]" />
            <div
              className={`h-1 flex-1 rounded-full transition-colors duration-200 ${
                step === 2 ? "bg-[var(--color-accent)]" : "bg-slate-200"
              }`}
            />
          </div>
        </div>

        {/* Body */}
        <div className="p-6">
          {/* ── Step 1: Mötesinbjudan ── */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-secondary)]">
                Mötesinbjudan
              </p>

              <div className="space-y-1.5">
                <label className={labelClass}>Titel</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={`Möte med ${lead.företag}`}
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className={labelClass}>Datum</label>
                  <input
                    type="date"
                    value={date}
                    min={todayISO()}
                    onChange={(e) => setDate(e.target.value)}
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className={labelClass}>Längd</label>
                  <select
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value) as 30 | 45 | 60)}
                    className={inputClass}
                  >
                    <option value={30}>30 min</option>
                    <option value={45}>45 min</option>
                    <option value={60}>60 min</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className={labelClass}>Tid</label>
                <TimeSelect value={time} onChange={setTime} />
              </div>

              <div className="space-y-1.5">
                <label className={labelClass}>Kundens e-post</label>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="namn@företag.se"
                  className={inputClass}
                />
              </div>

              <div className="space-y-1.5">
                <label className={labelClass}>Kundens namn</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Förnamn Efternamn"
                  className={inputClass}
                />
              </div>

              <div className="space-y-1.5">
                <label className={labelClass}>Anteckningar</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Valfria anteckningar..."
                  className={`${inputClass} resize-y`}
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendTeams}
                  onChange={(e) => setSendTeams(e.target.checked)}
                  disabled={!isMsConnected}
                  className="rounded border-[var(--color-border-input)] text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
                />
                <span
                  className={`text-sm ${isMsConnected ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-secondary)]"}`}
                >
                  Skapa Teams-möte
                  {!isMsConnected && (
                    <span className="text-xs ml-1">(Microsoft ej kopplad)</span>
                  )}
                </span>
              </label>
            </div>
          )}

          {/* ── Step 2: Konfigurera demo ── */}
          {step === 2 && (
            <div className="space-y-5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-secondary)]">
                Konfigurera demo
              </p>

              {/* Bokadirekt question */}
              <div className="space-y-2">
                <label className={labelClass}>Har kunden Bokadirekt?</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-[var(--color-text-primary)]">
                    <input
                      type="radio"
                      name="hasBokadirekt"
                      value="yes"
                      checked={hasBokadirekt === "yes"}
                      onChange={() => {
                        setHasBokadirekt("yes");
                        setDemoSource(null);
                      }}
                      className="text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
                    />
                    Ja
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-[var(--color-text-primary)]">
                    <input
                      type="radio"
                      name="hasBokadirekt"
                      value="no"
                      checked={hasBokadirekt === "no"}
                      onChange={() => setHasBokadirekt("no")}
                      className="text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
                    />
                    Nej
                  </label>
                </div>
              </div>

              {/* Bokadirekt URL */}
              {hasBokadirekt === "yes" && (
                <div className="space-y-1.5">
                  <label className={labelClass}>Bokadirekt-länk</label>
                  <input
                    type="url"
                    value={bokadirektUrl}
                    onChange={(e) => setBokadirektUrl(e.target.value)}
                    placeholder="https://www.bokadirekt.se/places/..."
                    className={inputClass}
                  />
                </div>
              )}

              {/* No Bokadirekt: choose source */}
              {hasBokadirekt === "no" && (
                <div className="space-y-3">
                  <label className={labelClass}>Källa för demo</label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-[var(--color-text-primary)]">
                      <input
                        type="radio"
                        name="demoSource"
                        value="existing_website"
                        checked={demoSource === "existing_website"}
                        onChange={() => setDemoSource("existing_website")}
                        className="text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
                      />
                      Befintlig hemsida
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-[var(--color-text-primary)]">
                      <input
                        type="radio"
                        name="demoSource"
                        value="manual"
                        checked={demoSource === "manual"}
                        onChange={() => setDemoSource("manual")}
                        className="text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
                      />
                      Manuellt
                    </label>
                  </div>

                  {demoSource === "existing_website" && (
                    <div className="space-y-1.5">
                      <label className={labelClass}>Hemsida-URL</label>
                      <input
                        type="url"
                        value={existingWebsiteUrl}
                        onChange={(e) => setExistingWebsiteUrl(e.target.value)}
                        placeholder="https://www.företaget.se"
                        className={inputClass}
                      />
                    </div>
                  )}

                  {demoSource === "manual" && (
                    <div className="space-y-1.5">
                      <label className={labelClass}>Företagsinformation</label>
                      <textarea
                        value={manualInfo}
                        onChange={(e) => setManualInfo(e.target.value)}
                        rows={4}
                        placeholder="Beskriv företaget, tjänster, målgrupp..."
                        className={`${inputClass} resize-y`}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
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
        <div className="flex justify-between gap-3 px-6 py-4 border-t border-[var(--color-border)]">
          {step === 1 ? (
            <>
              <Button variant="secondary" onClick={onClose}>
                Avbryt
              </Button>
              <Button variant="primary" onClick={handleNext} disabled={!step1Valid}>
                Nästa
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                onClick={handleBack}
                disabled={submitOutcome.isPending}
              >
                Tillbaka
              </Button>
              <Button
                variant="primary"
                onClick={handleSubmit}
                disabled={!isStep2Valid() || submitOutcome.isPending}
              >
                {submitOutcome.isPending ? "Bokar..." : "Slutför"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
