import { useAdminStats } from "@/api/admin";
import { useMeetings } from "@/api/meetings";
import { useLeads } from "@/api/leads";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/stat-card";
import { formatDate, formatTime, formatPhone } from "@/lib/format";

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useAdminStats();
  const { data: meetings } = useMeetings();
  const { data: leads } = useLeads();

  const today = todayDateString();

  const todaysMeetings = (meetings ?? []).filter(
    (m) => m.meeting_date === today && m.status === "scheduled",
  );

  const callbacks = (leads ?? []).filter((l) => l.status === "callback");

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1
          className="font-semibold text-[var(--color-text-primary)]"
          style={{ fontSize: "24px" }}
        >
          Dashboard
        </h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
        <StatCard
          label="Totalt leads"
          value={statsLoading ? "—" : (stats?.total_leads ?? 0)}
        />
        <StatCard
          label="Nya i kön"
          value={statsLoading ? "—" : (stats?.new ?? 0)}
          color="var(--color-accent)"
        />
        <StatCard
          label="Tilldelade"
          value={statsLoading ? "—" : (stats?.assigned ?? 0)}
        />
        <StatCard
          label="Möten bokade"
          value={statsLoading ? "—" : (stats?.meeting_booked ?? 0)}
          color="var(--color-success)"
        />
        <StatCard
          label="Kunder"
          value={statsLoading ? "—" : (stats?.customer ?? 0)}
          color="var(--color-success)"
        />
        <StatCard
          label="Karantän"
          value={statsLoading ? "—" : (stats?.quarantine ?? 0)}
          color="var(--color-danger)"
        />
      </div>

      {/* Today's meetings */}
      <section>
        <Card>
          <CardTitle className="mb-4">Dagens möten</CardTitle>
          {todaysMeetings.length === 0 ? (
            <p className="text-sm text-[var(--color-text-secondary)]">
              Inga möten inbokade för idag.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {todaysMeetings.map((meeting) => (
                <li key={meeting.id} className="py-3 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">
                      {meeting.title}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-mono text-[var(--color-text-secondary)]">
                      {formatDate(meeting.meeting_date)} {formatTime(meeting.meeting_time)}
                    </span>
                    <Badge status={meeting.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* Callbacks */}
      <section>
        <Card>
          <CardTitle className="mb-4">Återuppringningar</CardTitle>
          {callbacks.length === 0 ? (
            <p className="text-sm text-[var(--color-text-secondary)]">
              Inga återuppringningar i kö.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {callbacks.map((lead) => (
                <li key={lead.id} className="py-3 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">
                      {lead.företag}
                    </p>
                    <p className="text-sm font-mono text-indigo-600 mt-0.5">
                      {formatPhone(lead.telefon)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {lead.callback_at && (
                      <span className="text-sm text-[var(--color-text-secondary)]">
                        {formatDate(lead.callback_at)}
                      </span>
                    )}
                    <Badge status={lead.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}
