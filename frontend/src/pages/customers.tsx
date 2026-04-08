import { useNavigate } from "react-router-dom";
import { useDeals } from "@/api/deals";
import { formatDate } from "@/lib/format";
import Loader from "@/components/kokonutui/loader";
import { EmptyState } from "@/components/ui/empty-state";

export function CustomersPage() {
  const navigate = useNavigate();
  const { data: deals, isLoading } = useDeals();

  const customers = (deals ?? []).filter((d) => d.stage === "won");

  return (
    <div className="space-y-6">
      {/* Header — matches dashboard text-[22px] font-light */}
      <div>
        <h1 className="text-[22px] font-light tracking-[-0.5px] text-[var(--color-text-primary)]">
          Kunder
        </h1>
        {!isLoading && customers.length > 0 && (
          <p className="mt-0.5 text-[13px] text-[var(--color-text-secondary)]">
            {customers.length} {customers.length === 1 ? "kund" : "kunder"} totalt
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader size="sm" title="Laddar kunder" />
        </div>
      ) : customers.length === 0 ? (
        <EmptyState message="Inga kunder än" />
      ) : (
        <div className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-panel)]">
                <th className="px-5 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)]">
                  Företag
                </th>
                <th className="px-5 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)]">
                  Agent
                </th>
                <th className="px-5 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)]">
                  Avslutsdatum
                </th>
                <th className="px-5 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)]">
                  Domän
                </th>
              </tr>
            </thead>
            <tbody>
              {customers.map((deal, i) => (
                <tr
                  key={deal.id}
                  role="button"
                  tabIndex={0}
                  className={`cursor-pointer transition-colors hover:bg-[var(--color-bg-panel)] ${
                    i !== customers.length - 1
                      ? "border-b border-[var(--color-border)]"
                      : ""
                  }`}
                  onClick={() => void navigate(`/pipeline/${deal.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ")
                      void navigate(`/pipeline/${deal.id}`);
                  }}
                >
                  <td className="px-5 py-3.5 font-medium text-[var(--color-text-primary)]">
                    {deal.lead_name ?? "—"}
                  </td>
                  <td className="px-5 py-3.5 text-[var(--color-text-secondary)]">
                    {deal.user_name ?? "—"}
                  </td>
                  <td className="px-5 py-3.5 text-[var(--color-text-secondary)]">
                    {formatDate(deal.updated_at)}
                  </td>
                  <td className="px-5 py-3.5 text-[var(--color-text-secondary)]">
                    {deal.domain ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
