import { useNavigate } from "react-router-dom";
import { useDashboard, useLeaderboard } from "@/api/dashboard";
import { useMe } from "@/api/auth";
import { Leaderboard } from "@/components/leaderboard";
import { StatCard } from "@/components/stat-card";
import { GoalProgress } from "@/components/goal-progress";
import { Button } from "@/components/ui/button";

function formatDate(): string {
  return new Date().toLocaleDateString("sv-SE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { data: user } = useMe();
  const { data: dashboard, isLoading } = useDashboard();
  const { data: leaderboard } = useLeaderboard();

  const myStats = dashboard?.my_stats;
  const conversion = dashboard?.conversion;
  const goalProgress = dashboard?.goal_progress ?? [];

  return (
    <div className="space-y-6">
      {/* Hälsning */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-light tracking-[-0.5px] text-[var(--color-text-primary)]">
            Hej {user?.name?.split(" ")[0] ?? ""}
          </h1>
          <p className="mt-0.5 text-[13px] text-[var(--color-text-secondary)]">
            {formatDate()}
          </p>
        </div>
        <Button variant="primary" onClick={() => void navigate("/dialer")}>
          Nästa kund →
        </Button>
      </div>

      {/* Personliga KPI:er */}
      <div className="grid grid-cols-3 gap-[var(--spacing-element)]">
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
      </div>

      {/* Mål */}
      <GoalProgress goals={goalProgress} />

      {/* Leaderboard */}
      <Leaderboard entries={leaderboard ?? []} currentUserId={user?.id} />
    </div>
  );
}
