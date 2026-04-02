import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useNextLead, useLeadDetail, useSubmitOutcome } from "@/api/leads";
import { Button } from "@/components/ui/button";
import { LeadInfo } from "@/components/lead-info";
import { OutcomePanel } from "@/components/outcome-panel";
import { HistoryTimeline } from "@/components/history-timeline";

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
            className="font-semibold text-[var(--color-text-primary)] mb-2"
            style={{ fontSize: "22px" }}
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
        <p className="text-[var(--color-text-secondary)]">Laddar kund...</p>
      </div>
    );
  }

  const { lead, calls, audit_logs: auditLogs } = leadData;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1
          className="font-semibold text-[var(--color-text-primary)]"
          style={{ fontSize: "22px" }}
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

      {/* Three-column grid: LeadInfo | OutcomePanel | Google Search */}
      <div className="grid gap-6" style={{ gridTemplateColumns: "2fr 1.5fr 2fr" }}>
        <div className="space-y-6">
          <LeadInfo lead={lead} />
          <HistoryTimeline callLogs={calls} auditLogs={auditLogs} />
        </div>
        <OutcomePanel leadId={lead.id} onOutcomeSubmitted={handleOutcomeSubmitted} />
        <div className="rounded-lg border border-[var(--color-border)] bg-white overflow-hidden" style={{ height: "calc(100vh - 160px)", position: "sticky", top: "80px" }}>
          <div className="px-4 py-2.5 bg-[var(--color-bg-panel)] border-b border-[var(--color-border)]">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
              Webbsökning — {lead.företag}
            </p>
          </div>
          <iframe
            key={lead.id}
            src={`https://www.google.com/search?igu=1&q=${encodeURIComponent(lead.företag + " " + (lead.stad ?? ""))}`}
            title="Google-sökning"
            className="w-full border-0"
            style={{ height: "calc(100% - 40px)" }}
            sandbox="allow-scripts allow-same-origin allow-popups"
          />
        </div>
      </div>
    </div>
  );
}
