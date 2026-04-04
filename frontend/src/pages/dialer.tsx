import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useNextLead, useLeadDetail, useSubmitOutcome } from "@/api/leads";
import { Button } from "@/components/ui/button";
import { LeadInfo } from "@/components/lead-info";
import { OutcomePanel } from "@/components/outcome-panel";
import { HistoryTimeline } from "@/components/history-timeline";
import Loader from "@/components/kokonutui/loader";

export function DialerPage() {
  const navigate = useNavigate();
  const [currentLeadId, setCurrentLeadId] = useState<string | null>(null);

  const nextLeadMutation = useNextLead();
  const { data: leadData, isLoading: leadLoading } = useLeadDetail(
    currentLeadId ?? undefined,
  );

  function handleNextLead() {
    nextLeadMutation.mutate(undefined, {
      onSuccess: (newLead) => {
        if (newLead) {
          setCurrentLeadId(newLead.id);
        } else {
          setCurrentLeadId(null);
        }
      },
    });
  }

  const skipOutcome = useSubmitOutcome(currentLeadId ?? "");

  function handleSkip() {
    if (!currentLeadId) return;
    skipOutcome.mutate(
      { outcome: "no_answer", notes: "Hoppade över" },
      { onSuccess: () => handleNextLead() }
    );
  }

  function handleOutcomeSubmitted() {
    handleNextLead();
  }

  // State: no lead yet
  if (!currentLeadId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className="text-center">
          <h2
            className="text-[22px] font-light tracking-[-0.5px] text-[var(--color-text-primary)] mb-2"
          >
            {nextLeadMutation.data === null
              ? "Inga fler leads i kön"
              : "Redo att börja ringa?"}
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Tryck på knappen nedan för att hämta nästa kund i kön.
          </p>
        </div>
        <Button
          variant="primary"
          size="lg"
          onClick={handleNextLead}
          disabled={nextLeadMutation.isPending}
        >
          {nextLeadMutation.isPending ? "Hämtar..." : "Nästa kund"}
        </Button>
        {nextLeadMutation.isError && (
          <p className="text-sm text-[var(--color-danger)]">
            Kunde inte hämta nästa kund.
          </p>
        )}
      </div>
    );
  }

  // State: loading
  if (leadLoading || !leadData) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader size="sm" title="Laddar kundkort" subtitle="Hämtar företagsinfo" />
      </div>
    );
  }

  const { lead, calls } = leadData;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1
          className="text-[22px] font-light tracking-[-0.5px] text-[var(--color-text-primary)]"
        >
          {lead.företag}
        </h1>
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="default"
            onClick={handleSkip}
            disabled={skipOutcome.isPending || nextLeadMutation.isPending}
          >
            Hoppa över
          </Button>
          <Button
            variant="secondary"
            size="default"
            onClick={() => void navigate("/dashboard")}
          >
            Dashboard
          </Button>
        </div>
      </div>

      {/* Responsive grid: LeadInfo | OutcomePanel | Google Search */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-[2fr_1.5fr] xl:grid-cols-[2fr_1.5fr_2fr]">
        <div className="space-y-6">
          <LeadInfo lead={lead} />
          <HistoryTimeline callLogs={calls} />
        </div>
        <OutcomePanel leadId={lead.id} companyName={lead.företag} leadData={lead} onOutcomeSubmitted={handleOutcomeSubmitted} />
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] overflow-hidden h-[calc(100vh-160px)] sticky top-[80px]">
          <div className="px-4 py-2.5 bg-[var(--color-bg-panel)] border-b border-[var(--color-border)]">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
              Webbsökning — {lead.företag}
            </p>
          </div>
          <div className="p-4 space-y-3">
            {/* Main search button */}
            <a
              href={`https://www.google.com/search?q=${encodeURIComponent(lead.företag + " " + (lead.stad ?? ""))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full h-12 rounded-md bg-[var(--color-accent)] text-white font-medium text-sm hover:bg-[var(--color-accent-hover)] transition-colors"
            >
              Sök på Google
            </a>

            {/* Quick links */}
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-secondary)] pt-2">
              Snabblänkar
            </p>
            <div className="space-y-2">
              {[
                { label: "Google", url: `https://www.google.com/search?q=${encodeURIComponent(lead.företag + " " + (lead.stad ?? ""))}` },
                { label: "Google Maps", url: `https://www.google.com/maps/search/${encodeURIComponent([lead.adress, lead.postnummer, lead.stad].filter(Boolean).join(" "))}` },
                { label: "Hitta.se", url: `https://www.hitta.se/sök?vad=${encodeURIComponent(lead.företag)}&var=${encodeURIComponent(lead.stad ?? "")}` },
                { label: "Eniro", url: `https://www.eniro.se/s/${encodeURIComponent(lead.företag)}` },
                { label: "Allabolag", url: lead.orgnr ? `https://www.allabolag.se/${lead.orgnr}` : `https://www.allabolag.se/what/${encodeURIComponent(lead.företag)}` },
                { label: `"${lead.företag}" hemsida`, url: `https://www.google.com/search?q=${encodeURIComponent('"' + lead.företag + '" hemsida')}` },
                ...(lead.vd_namn ? [{ label: `MrKoll — ${lead.vd_namn}`, url: `https://www.google.com/search?q=${encodeURIComponent(lead.vd_namn + " site:mrkoll.se")}` }] : []),
              ].map((link) => (
                <a
                  key={link.label}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between px-3 py-2.5 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-bg-panel)] transition-colors"
                >
                  <span>{link.label}</span>
                  <span className="text-[var(--color-text-secondary)]">↗</span>
                </a>
              ))}
            </div>

            {/* Phone quick action */}
            {lead.telefon && (
              <>
                <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-secondary)] pt-2">
                  Ring
                </p>
                <a
                  href={`tel:${lead.telefon}`}
                  className="flex items-center justify-center gap-2 w-full h-12 rounded-md bg-[var(--color-success)] text-white font-medium text-sm hover:opacity-90 transition-colors"
                >
                  {lead.telefon}
                </a>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
