import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Lead, CallLog, AuditLog } from "@/api/types";
import { useNextLead, useLeadDetail } from "@/api/leads";
import { Button } from "@/components/ui/button";
import { LeadInfo } from "@/components/lead-info";
import { OutcomePanel } from "@/components/outcome-panel";
import { HistoryTimeline } from "@/components/history-timeline";

// The lead detail API may return these extra fields
interface LeadDetail extends Lead {
  call_logs?: CallLog[];
  audit_logs?: AuditLog[];
}

export function DialerPage() {
  const navigate = useNavigate();
  const [currentLeadId, setCurrentLeadId] = useState<string | null>(null);

  const nextLeadMutation = useNextLead();
  const { data: leadData, isLoading: leadLoading } = useLeadDetail(
    currentLeadId ?? undefined,
  );

  const lead = leadData as LeadDetail | undefined;

  function handleNextLead() {
    nextLeadMutation.mutate(undefined, {
      onSuccess: (newLead) => {
        setCurrentLeadId(newLead.id);
      },
    });
  }

  function handleSkip() {
    setCurrentLeadId(null);
  }

  function handleOutcomeSubmitted() {
    // Auto-fetch next lead after outcome
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
            Redo att börja ringa?
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
            {nextLeadMutation.error?.message ?? "Kunde inte hämta nästa kund."}
          </p>
        )}
      </div>
    );
  }

  // State: loading lead detail
  if (leadLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-[var(--color-text-secondary)]">Laddar kund...</p>
      </div>
    );
  }

  // State: lead loaded
  if (!lead) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-[var(--color-danger)]">Kunde inte ladda kunddata.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1
          className="font-semibold text-[var(--color-text-primary)]"
          style={{ fontSize: "22px" }}
        >
          {lead.company ?? `${lead.first_name} ${lead.last_name}`}
        </h1>
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="default"
            onClick={handleSkip}
            disabled={nextLeadMutation.isPending}
          >
            Hoppa över
          </Button>
          <Button
            variant="primary"
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

      {/* History timeline below */}
      <HistoryTimeline
        callLogs={lead.call_logs}
        auditLogs={lead.audit_logs}
      />
    </div>
  );
}
