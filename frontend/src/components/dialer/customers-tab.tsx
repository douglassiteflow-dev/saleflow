import { useDeals } from "@/api/deals";
import type { Deal } from "@/api/types";

interface CustomersTabProps {
  onSelectDeal: (dealId: string) => void;
}

export function CustomersTab({ onSelectDeal }: CustomersTabProps) {
  const { data: deals, isLoading } = useDeals();

  const customers = (deals ?? []).filter((d) => d.stage === "won");

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-[var(--color-text-secondary)]">Laddar kunder...</p>
      </div>
    );
  }

  if (customers.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-[var(--color-text-secondary)]">Inga kunder ännu</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-panel)]">
            <th className="text-left px-5 py-2.5 text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)]">Företag</th>
            <th className="text-left px-5 py-2.5 text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)]">Domän</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((deal) => (
            <CustomerRow key={deal.id} deal={deal} onClick={() => onSelectDeal(deal.id)} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CustomerRow({ deal, onClick }: { deal: Deal; onClick: () => void }) {
  const name = deal.lead_name ?? deal.lead_id;

  return (
    <tr
      onClick={onClick}
      className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg-panel)] cursor-pointer transition-colors"
    >
      <td className="px-5 py-2.5 font-medium text-[var(--color-text-primary)]">{name}</td>
      <td className="px-5 py-2.5 text-[var(--color-text-secondary)]">{deal.domain ?? "—"}</td>
    </tr>
  );
}
