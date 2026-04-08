import { useNavigate } from "react-router-dom";
import { useDeals } from "@/api/deals";
import { ACTIVE_STAGES, getStageConfig, formatDaysAgo, daysFromDate } from "@/lib/pipeline-config";
import type { DealStage, Deal } from "@/api/types";
import Loader from "@/components/kokonutui/loader";

const STAGE_ORDER: Exclude<DealStage, "won" | "cancelled">[] = ACTIVE_STAGES as Exclude<DealStage, "won" | "cancelled">[];

/** Color class for time-in-stage warning */
function timeWarningClass(dateStr: string): string {
  const days = daysFromDate(dateStr);
  if (days >= 14) return "text-red-600 font-medium";
  if (days >= 7) return "text-amber-600 font-medium";
  return "text-[var(--color-text-secondary)]";
}

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
      {/* Header — matches dashboard text-[22px] font-light */}
      <div>
        <h1 className="text-[22px] font-light tracking-[-0.5px] text-[var(--color-text-primary)]">
          Pipeline
        </h1>
        {!isLoading && activeDeals.length > 0 && (
          <p className="mt-0.5 text-[13px] text-[var(--color-text-secondary)]">
            {activeDeals.length} aktiva deals
          </p>
        )}
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
        <div className="space-y-6">
          {Object.entries(grouped).map(([stage, stageDeals]) => {
            const config = getStageConfig(stage);
            return (
              <StageSection
                key={stage}
                label={config.label}
                count={stageDeals.length}
                colorClass={config.color}
                textColorClass={config.textColor}
                deals={stageDeals}
                onDealClick={(id) => void navigate(`/pipeline/${id}`)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stage section                                                      */
/* ------------------------------------------------------------------ */

interface StageSectionProps {
  label: string;
  count: number;
  colorClass: string;
  textColorClass: string;
  deals: Deal[];
  onDealClick: (id: string) => void;
}

function StageSection({ label, count, colorClass, textColorClass, deals, onDealClick }: StageSectionProps) {
  return (
    <div>
      {/* Section header — accent dot + label + count badge (matches dashboard section headers) */}
      <div className="flex items-center gap-2 mb-3">
        <span className={`h-2 w-2 rounded-full ${colorClass}`} />
        <h2 className="text-[14px] font-medium uppercase tracking-[0.05em] text-[var(--color-text-secondary)]">
          {label}
        </h2>
        <span
          className={`inline-flex items-center justify-center h-5 min-w-[20px] rounded-full px-1.5 text-[11px] font-medium ${colorClass} ${textColorClass}`}
        >
          {count}
        </span>
      </div>

      {/* Deal rows — rounded card matching dashboard styling */}
      <div className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        {deals.map((deal, i) => (
          <div
            key={deal.id}
            role="button"
            tabIndex={0}
            className={`flex items-center gap-4 px-5 py-3.5 cursor-pointer transition-colors hover:bg-[var(--color-bg-panel)] ${
              i !== deals.length - 1 ? "border-b border-[var(--color-border)]" : ""
            }`}
            onClick={() => onDealClick(deal.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onDealClick(deal.id);
            }}
          >
            {/* Company */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                {deal.lead_name ?? "\u2014"}
              </p>
            </div>

            {/* Agent — hidden on narrow (dialer sidebar) */}
            <div className="hidden sm:block flex-shrink-0 w-28">
              <p className="text-[13px] text-[var(--color-text-secondary)] truncate">
                {deal.user_name ?? "\u2014"}
              </p>
            </div>

            {/* Time in stage with visual warning */}
            <div className="flex-shrink-0 w-20 text-right">
              <span className={`text-[13px] font-mono ${timeWarningClass(deal.updated_at)}`}>
                {formatDaysAgo(deal.updated_at)}
              </span>
            </div>

            {/* Chevron */}
            <svg className="h-4 w-4 text-[var(--color-text-secondary)]/40 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </div>
        ))}
      </div>
    </div>
  );
}
