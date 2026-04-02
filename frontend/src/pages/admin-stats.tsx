import { useAdminStats } from "@/api/admin";
import { useLeads } from "@/api/leads";
import { StatCard } from "@/components/stat-card";
import { Card, CardTitle } from "@/components/ui/card";
import type { LeadStatus } from "@/api/types";
import Loader from "@/components/kokonutui/loader";

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "Nya",
  assigned: "Tilldelade",
  callback: "Återuppringning",
  meeting_booked: "Möte bokat",
  quarantine: "Karantän",
  bad_number: "Fel nummer",
  customer: "Kund",
};

const STATUS_COLORS: Record<LeadStatus, string> = {
  new: "bg-blue-500",
  assigned: "bg-indigo-500",
  callback: "bg-amber-500",
  meeting_booked: "bg-emerald-500",
  quarantine: "bg-orange-500",
  bad_number: "bg-slate-400",
  customer: "bg-purple-500",
};

export function AdminStatsPage() {
  const { data: stats, isLoading: statsLoading } = useAdminStats();
  const { data: leads, isLoading: leadsLoading } = useLeads();

  const isLoading = statsLoading || leadsLoading;

  // Count leads by status
  const statusCounts = (leads ?? []).reduce<Record<string, number>>(
    (acc, lead) => {
      acc[lead.status] = (acc[lead.status] ?? 0) + 1;
      return acc;
    },
    {},
  );

  const total = leads?.length ?? 0;

  const statuses = Object.keys(STATUS_LABELS) as LeadStatus[];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1
          className="font-semibold text-[var(--color-text-primary)]"
          style={{ fontSize: "24px" }}
        >
          Statistik
        </h1>
      </div>

      {/* Overview stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Totalt leads"
          value={isLoading ? "—" : (stats?.total_leads ?? 0)}
        />
        <StatCard
          label="Nya"
          value={isLoading ? "—" : (stats?.new ?? 0)}
        />
        <StatCard
          label="Möten bokade"
          value={isLoading ? "—" : (stats?.meeting_booked ?? 0)}
        />
        <StatCard
          label="Kunder"
          value={isLoading ? "—" : (stats?.customer ?? 0)}
        />
      </div>

      {/* Lead status breakdown */}
      <Card>
        <CardTitle className="mb-6">Leads per status</CardTitle>

        {isLoading ? (
          <Loader size="sm" title="Laddar statistik" />
        ) : (
          <div className="space-y-4">
            {statuses.map((status) => {
              const count = statusCounts[status] ?? 0;
              const pct = total > 0 ? (count / total) * 100 : 0;

              return (
                <div key={status} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span
                      className="text-[var(--color-text-secondary)] uppercase tracking-wider"
                      style={{ fontSize: "12px" }}
                    >
                      {STATUS_LABELS[status]}
                    </span>
                    <span className="text-sm font-medium text-[var(--color-text-primary)]">
                      {count}
                      {total > 0 && (
                        <span className="ml-1 text-xs text-[var(--color-text-secondary)]">
                          ({pct.toFixed(1)}%)
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${STATUS_COLORS[status]}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
