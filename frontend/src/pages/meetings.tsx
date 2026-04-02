import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMeetings, useCancelMeeting } from "@/api/meetings";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MeetingForm } from "@/components/meeting-form";
import { MeetingCalendar } from "@/components/meeting-calendar";
import { formatDate, formatTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import Loader from "@/components/kokonutui/loader";

type FilterTab = "upcoming" | "today" | "all" | "completed" | "cancelled";

const TABS: { key: FilterTab; label: string }[] = [
  { key: "upcoming", label: "Kommande" },
  { key: "today", label: "Idag" },
  { key: "all", label: "Alla" },
  { key: "completed", label: "Genomförda" },
  { key: "cancelled", label: "Avbokade" },
];

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

type ViewMode = "list" | "calendar";

export function MeetingsPage() {
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>("upcoming");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  const { data: meetings, isLoading } = useMeetings();
  const cancelMeeting = useCancelMeeting();

  function handleCancel(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (confirm("Vill du avboka detta möte?")) {
      void cancelMeeting.mutate(id);
    }
  }

  const today = todayDateString();

  const filtered = (meetings ?? []).filter((m) => {
    switch (activeTab) {
      case "upcoming":
        return m.status === "scheduled" && m.meeting_date >= today;
      case "today":
        return m.meeting_date === today && m.status !== "cancelled";
      case "completed":
        return m.status === "completed";
      case "cancelled":
        return m.status === "cancelled";
      case "all":
      default:
        return true;
    }
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1
          className="font-semibold text-[var(--color-text-primary)]"
          style={{ fontSize: "24px" }}
        >
          Möten
        </h1>
        <div className="flex items-center gap-3">
          <div className="flex rounded-md border border-[var(--color-border)] overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={cn(
                "px-3 py-1.5 text-sm font-medium transition-colors",
                viewMode === "list" ? "bg-[var(--color-accent)] text-white" : "bg-white text-[var(--color-text-secondary)] hover:bg-slate-50",
              )}
            >
              Lista
            </button>
            <button
              type="button"
              onClick={() => setViewMode("calendar")}
              className={cn(
                "px-3 py-1.5 text-sm font-medium transition-colors",
                viewMode === "calendar" ? "bg-[var(--color-accent)] text-white" : "bg-white text-[var(--color-text-secondary)] hover:bg-slate-50",
              )}
            >
              Kalender
            </button>
          </div>
          <Button
            variant={showForm ? "secondary" : "primary"}
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "Stäng formulär" : "Nytt möte"}
          </Button>
        </div>
      </div>

      {/* Inline form */}
      {showForm && (
        <MeetingForm onCancel={() => setShowForm(false)} />
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-[var(--color-border)]">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
              activeTab === tab.key
                ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Calendar view */}
      {viewMode === "calendar" && (
        <Card>
          <MeetingCalendar
            meetings={meetings ?? []}
            currentMonth={calendarMonth}
            onMonthChange={setCalendarMonth}
            onMeetingClick={(id) => void navigate(`/meetings/${id}`)}
          />
        </Card>
      )}

      {/* Table */}
      {viewMode === "list" && <Card>
        <CardTitle className="mb-4">
          {TABS.find((t) => t.key === activeTab)?.label ?? "Möten"}
        </CardTitle>

        {isLoading ? (
          <Loader size="sm" title="Laddar möten" />
        ) : filtered.length === 0 ? (
          <p className="text-sm text-[var(--color-text-secondary)]">
            Inga möten att visa.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th
                    className="px-4 py-2.5 font-medium text-[var(--color-text-secondary)] uppercase tracking-wider"
                    style={{ fontSize: "12px" }}
                  >
                    Datum &amp; tid
                  </th>
                  <th
                    className="px-4 py-2.5 font-medium text-[var(--color-text-secondary)] uppercase tracking-wider"
                    style={{ fontSize: "12px" }}
                  >
                    Titel
                  </th>
                  <th
                    className="px-4 py-2.5 font-medium text-[var(--color-text-secondary)] uppercase tracking-wider"
                    style={{ fontSize: "12px" }}
                  >
                    Företag
                  </th>
                  <th
                    className="px-4 py-2.5 font-medium text-[var(--color-text-secondary)] uppercase tracking-wider"
                    style={{ fontSize: "12px" }}
                  >
                    Agent
                  </th>
                  <th
                    className="px-4 py-2.5 font-medium text-[var(--color-text-secondary)] uppercase tracking-wider"
                    style={{ fontSize: "12px" }}
                  >
                    Status
                  </th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((meeting, i) => (
                  <tr
                    key={meeting.id}
                    className={cn(
                      "cursor-pointer hover:bg-slate-50 transition-colors",
                      i !== filtered.length - 1
                        ? "border-b border-slate-200"
                        : "",
                    )}
                    onClick={() => void navigate(`/meetings/${meeting.id}`)}
                  >
                    <td className="px-4 py-3 font-mono text-[var(--color-text-secondary)]">
                      {formatDate(meeting.meeting_date)} {formatTime(meeting.meeting_time)}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-primary)]">
                      <p className="font-medium">{meeting.title}</p>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-primary)]">
                      {meeting.lead?.företag ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                      {meeting.user_name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge status={meeting.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {meeting.status === "scheduled" && (
                        <Button
                          variant="danger"
                          size="default"
                          onClick={(e) => handleCancel(meeting.id, e)}
                          disabled={cancelMeeting.isPending}
                        >
                          Avboka
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>}
    </div>
  );
}
