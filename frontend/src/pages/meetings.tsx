import { useState } from "react";
import { useMeetings, useCancelMeeting } from "@/api/meetings";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MeetingForm } from "@/components/meeting-form";
import { formatDate, formatTime } from "@/lib/format";

export function MeetingsPage() {
  const [showForm, setShowForm] = useState(false);

  const { data: meetings, isLoading } = useMeetings();
  const cancelMeeting = useCancelMeeting();

  function handleCancel(id: string) {
    if (confirm("Vill du avboka detta möte?")) {
      void cancelMeeting.mutate(id);
    }
  }

  const upcoming = (meetings ?? []).filter((m) => m.status !== "cancelled");

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
        <Button
          variant={showForm ? "secondary" : "primary"}
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? "Stäng formulär" : "Nytt möte"}
        </Button>
      </div>

      {/* Inline form */}
      {showForm && (
        <MeetingForm onCancel={() => setShowForm(false)} />
      )}

      {/* Table */}
      <Card>
        <CardTitle className="mb-4">Kommande möten</CardTitle>

        {isLoading ? (
          <p className="text-sm text-[var(--color-text-secondary)]">
            Laddar möten...
          </p>
        ) : upcoming.length === 0 ? (
          <p className="text-sm text-[var(--color-text-secondary)]">
            Inga kommande möten.
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
                    Status
                  </th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {upcoming.map((meeting, i) => (
                  <tr
                    key={meeting.id}
                    className={
                      i !== upcoming.length - 1
                        ? "border-b border-slate-200"
                        : ""
                    }
                  >
                    <td className="px-4 py-3 font-mono text-[var(--color-text-secondary)]">
                      {formatDate(meeting.meeting_date)} {formatTime(meeting.meeting_time)}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-primary)]">
                      <p className="font-medium">{meeting.title}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge status={meeting.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {meeting.status === "scheduled" && (
                        <Button
                          variant="danger"
                          size="default"
                          onClick={() => handleCancel(meeting.id)}
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
      </Card>
    </div>
  );
}
