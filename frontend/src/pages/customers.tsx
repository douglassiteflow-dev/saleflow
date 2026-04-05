import { useNavigate } from "react-router-dom";
import { useDeals } from "@/api/deals";
import { Card } from "@/components/ui/card";
import Loader from "@/components/kokonutui/loader";

export function CustomersPage() {
  const navigate = useNavigate();
  const { data: deals, isLoading } = useDeals();

  const customers = (deals ?? []).filter((d) => d.stage === "won");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-light tracking-[-0.5px] text-[var(--color-text-primary)]">
          Kunder ({customers.length})
        </h1>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader size="sm" title="Laddar kunder" />
        </div>
      ) : customers.length === 0 ? (
        <p className="text-sm text-[var(--color-text-secondary)]">
          Inga kunder ännu
        </p>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--color-bg-panel)] text-left">
                  <th className="px-4 py-2.5 text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                    Företag
                  </th>
                  <th className="px-4 py-2.5 text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                    Domän
                  </th>
                  <th className="px-4 py-2.5 text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                    Agent
                  </th>
                </tr>
              </thead>
              <tbody>
                {customers.map((deal, i) => (
                  <tr
                    key={deal.id}
                    className={`cursor-pointer hover:bg-[var(--color-bg-panel)] transition-colors${
                      i !== customers.length - 1
                        ? " border-b border-slate-200"
                        : ""
                    }`}
                    onClick={() => void navigate(`/customers/${deal.id}`)}
                  >
                    <td className="px-4 py-3 font-medium text-[var(--color-text-primary)]">
                      {deal.lead_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                      {deal.domain ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                      {deal.user_name ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
