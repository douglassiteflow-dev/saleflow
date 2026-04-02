import { useNavigate } from "react-router-dom";
import { useDashboard } from "@/api/dashboard";
import { useMe } from "@/api/auth";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/stat-card";
import { formatDate, formatTime, formatDateTime, formatPhone } from "@/lib/format";

export function DashboardPage() {
  const navigate = useNavigate();
  const { data: user } = useMe();
  const { data: dashboard, isLoading } = useDashboard();

  const stats = dashboard?.stats;
  const todaysMeetings = dashboard?.todays_meetings ?? [];
  const callbacks = dashboard?.callbacks ?? [];
  const myStats = dashboard?.my_stats;

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
        <Button variant="primary" onClick={() => void navigate("/dialer")}>
          Nästa kund
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
        <StatCard
          label="Totalt leads"
          value={isLoading ? "—" : (stats?.total_leads ?? 0)}
        />
        <StatCard
          label="Nya i kön"
          value={isLoading ? "—" : (stats?.new ?? 0)}
        />
        <StatCard
          label="Tilldelade"
          value={isLoading ? "—" : (stats?.assigned ?? 0)}
        />
        <StatCard
          label="Möten bokade"
          value={isLoading ? "—" : (stats?.meeting_booked ?? 0)}
        />
        <StatCard
          label="Kunder"
          value={isLoading ? "—" : (stats?.customer ?? 0)}
        />
        <StatCard
          label="Karantän"
          value={isLoading ? "—" : (stats?.quarantine ?? 0)}
        />
      </div>

      {/* My stats */}
      {myStats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Samtal idag" value={myStats.calls_today} />
          <StatCard label="Möten idag" value={myStats.meetings_today} />
          <StatCard label="Totalt samtal" value={myStats.total_calls} />
          <StatCard label="Totalt möten" value={myStats.total_meetings} />
        </div>
      )}

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
                <li
                  key={meeting.id}
                  className="py-3 flex items-start justify-between gap-4 cursor-pointer hover:bg-[var(--color-bg-panel)] transition-colors rounded px-2 -mx-2"
                  onClick={() => void navigate(`/meetings/${meeting.id}`)}
                >
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">
                      {meeting.title}
                    </p>
                    {meeting.lead && (
                      <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
                        {meeting.lead.företag}
                      </p>
                    )}
                    {meeting.user_name && user?.role === "admin" && (
                      <p className="text-xs text-[var(--color-accent)] mt-0.5">
                        {meeting.user_name}
                      </p>
                    )}
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
                      <span className="text-sm font-mono text-[var(--color-text-secondary)]">
                        {formatDateTime(lead.callback_at)}
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
