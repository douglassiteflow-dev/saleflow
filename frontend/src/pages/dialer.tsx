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

      {/* Two-column grid: 3/5 LeadInfo, 2/5 OutcomePanel */}
      <div className="grid gap-6" style={{ gridTemplateColumns: "3fr 2fr" }}>
        <LeadInfo lead={lead} />
        <OutcomePanel leadId={lead.id} onOutcomeSubmitted={handleOutcomeSubmitted} />
      </div>

      {/* History timeline */}
      <HistoryTimeline
        callLogs={calls}
        auditLogs={auditLogs}
      />
    </div>
  );
}
