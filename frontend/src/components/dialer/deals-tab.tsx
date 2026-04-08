import { useDeals } from "@/api/deals";
import { cn } from "@/lib/cn";
import { getStageConfig } from "@/lib/pipeline-config";
import { EmptyState } from "@/components/ui/empty-state";
import type { Deal } from "@/api/types";

interface DealsTabProps {
  onSelectDeal: (dealId: string) => void;
}

export function DealsTab({ onSelectDeal }: DealsTabProps) {
  const { data: deals, isLoading } = useDeals();

  const activeDeals = (deals ?? []).filter((d) => d.stage !== "won" && d.stage !== "cancelled");

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-[var(--color-text-secondary)]">Laddar deals...</p>
      </div>
    );
  }

  if (activeDeals.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <EmptyState message="Inga deals ännu" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-panel)]">
            <th className="text-left px-5 py-2.5 text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)]">Företag</th>
            <th className="text-left px-5 py-2.5 text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)]">Status</th>
          </tr>
        </thead>
        <tbody>
          {activeDeals.map((deal) => (
            <DealRow key={deal.id} deal={deal} onClick={() => onSelectDeal(deal.id)} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DealRow({ deal, onClick }: { deal: Deal; onClick: () => void }) {
  const name = deal.lead_name ?? deal.lead_id;
  const stageConfig = getStageConfig(deal.stage);

  return (
    <tr
      onClick={onClick}
      className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg-panel)] cursor-pointer transition-colors"
    >
      <td className="px-5 py-2.5 font-medium text-[var(--color-text-primary)]">{name}</td>
      <td className="px-5 py-2.5">
        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border", stageConfig.color, stageConfig.textColor)}>
          {stageConfig.label}
        </span>
      </td>
    </tr>
  );
}
