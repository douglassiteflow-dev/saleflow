import { useDeals } from "@/api/deals";
import { cn } from "@/lib/cn";
import type { Deal } from "@/api/types";

const STAGE_LABELS: Record<string, string> = {
  meeting_booked: "Möte bokat",
  needs_website: "Väntar på hemsida",
  generating_website: "Hemsida genereras",
  reviewing: "Granskning",
  deployed: "Demo-länk redo",
  demo_followup: "Demo & uppföljning",
  contract_sent: "Avtal skickat",
  signed: "Signerat",
  dns_launch: "DNS & Lansering",
};

const STAGE_COLORS: Record<string, string> = {
  meeting_booked: "bg-blue-50 text-blue-700 border-blue-200",
  needs_website: "bg-amber-50 text-amber-700 border-amber-200",
  generating_website: "bg-purple-50 text-purple-700 border-purple-200",
  reviewing: "bg-indigo-50 text-indigo-700 border-indigo-200",
  deployed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  demo_followup: "bg-cyan-50 text-cyan-700 border-cyan-200",
  contract_sent: "bg-orange-50 text-orange-700 border-orange-200",
  signed: "bg-green-50 text-green-700 border-green-200",
  dns_launch: "bg-teal-50 text-teal-700 border-teal-200",
};

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
        <p className="text-sm text-[var(--color-text-secondary)]">Inga deals ännu</p>
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
  const label = STAGE_LABELS[deal.stage] ?? deal.stage;
  const color = STAGE_COLORS[deal.stage] ?? "bg-[var(--color-bg-panel)] text-[var(--color-text-secondary)] border-[var(--color-border)]";

  return (
    <tr
      onClick={onClick}
      className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg-panel)] cursor-pointer transition-colors"
    >
      <td className="px-5 py-2.5 font-medium text-[var(--color-text-primary)]">{name}</td>
      <td className="px-5 py-2.5">
        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border", color)}>
          {label}
        </span>
      </td>
    </tr>
  );
}
