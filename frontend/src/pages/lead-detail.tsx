import { useParams } from "react-router-dom";
import type { CallLog, AuditLog, Lead } from "@/api/types";
import { useLeadDetail } from "@/api/leads";
import { LeadInfo } from "@/components/lead-info";
import { HistoryTimeline } from "@/components/history-timeline";

interface LeadDetail extends Lead {
  call_logs?: CallLog[];
  audit_logs?: AuditLog[];
}

export function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: leadData, isLoading, isError, error } = useLeadDetail(id);

  const lead = leadData as LeadDetail | undefined;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-[var(--color-text-secondary)]">Laddar kund...</p>
      </div>
    );
  }

  if (isError || !lead) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-[var(--color-danger)]">
          {(error as Error | null)?.message ?? "Kunde inte ladda kunddata."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1
        className="font-semibold text-[var(--color-text-primary)]"
        style={{ fontSize: "22px" }}
      >
        {lead.company ?? `${lead.first_name} ${lead.last_name}`}
      </h1>

      <div className="grid gap-6" style={{ gridTemplateColumns: "3fr 2fr" }}>
        <LeadInfo lead={lead} />
        <div /> {/* Empty right column for layout balance */}
      </div>

      <HistoryTimeline
        callLogs={lead.call_logs}
        auditLogs={lead.audit_logs}
      />
    </div>
  );
}
