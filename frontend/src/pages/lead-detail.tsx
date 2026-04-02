import { useParams } from "react-router-dom";
import { useLeadDetail } from "@/api/leads";
import { LeadInfo } from "@/components/lead-info";
import { HistoryTimeline } from "@/components/history-timeline";
import Loader from "@/components/kokonutui/loader";

export function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: leadData, isLoading, isError, error } = useLeadDetail(id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader size="sm" title="Laddar kundkort" />
      </div>
    );
  }

  if (isError || !leadData) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-[var(--color-danger)]">
          {(error as Error | null)?.message ?? "Kunde inte ladda kunddata."}
        </p>
      </div>
    );
  }

  const { lead, calls, audit_logs: auditLogs } = leadData;

  return (
    <div className="space-y-6">
      <h1
        className="font-semibold text-[var(--color-text-primary)]"
        style={{ fontSize: "22px" }}
      >
        {lead.företag}
      </h1>

      <LeadInfo lead={lead} />

      <HistoryTimeline
        callLogs={calls}
        auditLogs={auditLogs}
      />
    </div>
  );
}
