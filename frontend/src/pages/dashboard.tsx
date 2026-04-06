import { useDashboard, useLeaderboard } from "@/api/dashboard";
import { useDeals } from "@/api/deals";
import { useMe } from "@/api/auth";
import { Leaderboard } from "@/components/leaderboard";
import { StatCard } from "@/components/stat-card";
import { LiveCalls } from "@/components/live-calls";
import type { DealStage } from "@/api/types";

function formatDate(): string {
  return new Date().toLocaleDateString("sv-SE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

const PIPELINE_STAGES: { key: DealStage; label: string }[] = [
  { key: "meeting_booked", label: "Möte bokat" },
  { key: "needs_website", label: "Behöver hemsida" },
  { key: "generating_website", label: "Genereras" },
  { key: "reviewing", label: "Granskning" },
  { key: "deployed", label: "Deployad" },
  { key: "demo_followup", label: "Demo" },
  { key: "contract_sent", label: "Avtal skickat" },
  { key: "signed", label: "Signerat" },
  { key: "dns_launch", label: "DNS" },
];

export function DashboardPage() {
  const { data: user } = useMe();
  const { data: dashboard, isLoading } = useDashboard();
  const { data: leaderboard } = useLeaderboard();
  const { data: deals } = useDeals();

  const stats = dashboard?.stats;
  const myStats = dashboard?.my_stats;
  const conversion = dashboard?.conversion;

  const activeDeals = (deals ?? []).filter((d) => d.stage !== "won" && d.stage !== "cancelled");
  const wonDeals = (deals ?? []).filter((d) => d.stage === "won");

  const stageCounts = PIPELINE_STAGES.map((s) => ({
    ...s,
    count: activeDeals.filter((d) => d.stage === s.key).length,
  })).filter((s) => s.count > 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-[22px] font-light tracking-[-0.5px] text-[var(--color-text-primary)]">
          Hej {user?.name?.split(" ")[0] ?? ""}
        </h1>
        <p className="mt-0.5 text-[13px] text-[var(--color-text-secondary)]">
          {formatDate()}
        </p>
      </div>

      {/* KPIer — teamövergripande */}
      <div className="grid grid-cols-4 gap-[var(--spacing-element)]">
        <StatCard
          label="Samtal idag"
          value={isLoading ? "—" : (myStats?.calls_today ?? 0)}
        />
        <StatCard
          label="Möten idag"
          value={isLoading ? "—" : (myStats?.meetings_today ?? 0)}
        />
        <StatCard
          label="Konvertering"
          value={isLoading ? "—" : (conversion?.rate ?? 0)}
          suffix="%"
        />
        <StatCard
          label="Aktiva deals"
          value={activeDeals.length}
        />
      </div>

      {/* Lead-stats */}
      <div className="grid grid-cols-5 gap-[var(--spacing-element)]">
        <StatCard label="Totala leads" value={isLoading ? "—" : (stats?.total_leads ?? 0)} />
        <StatCard label="Nya" value={isLoading ? "—" : (stats?.new ?? 0)} />
        <StatCard label="Tilldelade" value={isLoading ? "—" : (stats?.assigned ?? 0)} />
        <StatCard label="Karantän" value={isLoading ? "—" : (stats?.quarantine ?? 0)} />
        <StatCard label="Kunder" value={wonDeals.length} />
      </div>

      {/* Pipeline-översikt */}
      {stageCounts.length > 0 && (
        <div>
          <h2 className="mb-3 text-[14px] font-medium uppercase tracking-[0.05em] text-[var(--color-text-secondary)]">
            Pipeline
          </h2>
          <div className="flex gap-2 flex-wrap">
            {stageCounts.map((s) => (
              <div
                key={s.key}
                className="flex items-center gap-2 rounded-[10px] border border-[var(--color-border-default)] bg-[var(--color-bg-panel)] px-4 py-2.5"
              >
                <span className="text-[20px] font-light text-[var(--color-text-primary)]">{s.count}</span>
                <span className="text-[12px] text-[var(--color-text-secondary)]">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pågående samtal */}
      <LiveCalls />

      {/* Leaderboard */}
      <Leaderboard entries={leaderboard ?? []} currentUserId={user?.id} />
    </div>
  );
}
