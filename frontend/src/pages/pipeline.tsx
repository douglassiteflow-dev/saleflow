import { useNavigate } from "react-router-dom";
import { useDeals } from "@/api/deals";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ACTIVE_STAGES, getStageConfig, formatDaysAgo } from "@/lib/pipeline-config";
import type { DealStage } from "@/api/types";
import Loader from "@/components/kokonutui/loader";

const STAGE_ORDER: Exclude<DealStage, "won" | "cancelled">[] = ACTIVE_STAGES as Exclude<DealStage, "won" | "cancelled">[];

export function PipelinePage() {
  const navigate = useNavigate();
  const { data: deals, isLoading } = useDeals();

  const activeDeals = (deals ?? []).filter((d) => d.stage !== "won" && d.stage !== "cancelled");

  const grouped = STAGE_ORDER.reduce<
    Record<string, typeof activeDeals>
  >((acc, stage) => {
    const stageDeals = activeDeals.filter((d) => d.stage === stage);
    if (stageDeals.length > 0) {
      acc[stage] = stageDeals;
    }
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-light tracking-[-0.5px] text-[var(--color-text-primary)]">
          Pipeline
        </h1>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader size="sm" title="Laddar pipeline" />
        </div>
      ) : activeDeals.length === 0 ? (
        <p className="text-sm text-[var(--color-text-secondary)]">
          Inga aktiva deals
        </p>
      ) : (
        Object.entries(grouped).map(([stage, stageDeals]) => (
          <div key={stage} className="space-y-2">
            <h2 className="text-[14px] font-medium uppercase tracking-[0.05em] text-[var(--color-text-secondary)]">
              {getStageConfig(stage).label} ({stageDeals.length})
            </h2>
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[var(--color-bg-panel)] text-left">
                      <th className="px-4 py-2.5 text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                        Företag
                      </th>
                      <th className="px-4 py-2.5 text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                        Agent
                      </th>
                      <th className="px-4 py-2.5 text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                        Tid i steg
                      </th>
                      <th className="px-4 py-2.5 text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                        Steg
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {stageDeals.map((deal, i) => (
                      <tr
                        key={deal.id}
                        className={`cursor-pointer hover:bg-[var(--color-bg-panel)] transition-colors${
                          i !== stageDeals.length - 1
                            ? " border-b border-slate-200"
                            : ""
                        }`}
                        onClick={() => void navigate(`/pipeline/${deal.id}`)}
                      >
                        <td className="px-4 py-3 font-medium text-[var(--color-text-primary)]">
                          {deal.lead_name ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                          {deal.user_name ?? "—"}
                        </td>
                        <td className="px-4 py-3 font-mono text-[var(--color-text-secondary)]">
                          {formatDaysAgo(deal.updated_at)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge status={deal.stage === "meeting_completed" ? "in_progress" : "scheduled"} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        ))
      )}
    </div>
  );
}
