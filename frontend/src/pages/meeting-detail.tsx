import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMeetingDetail, useUpdateMeeting, useCancelMeeting } from "@/api/meetings";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TimeSelect } from "@/components/ui/time-select";
import { HistoryTimeline } from "@/components/history-timeline";
import { formatDate, formatTime, formatPhone } from "@/lib/format";
import { todayISO } from "@/lib/date";
import Loader from "@/components/kokonutui/loader";

export function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = useMeetingDetail(id);
  const updateMeeting = useUpdateMeeting();
  const cancelMeeting = useCancelMeeting();

  const [editing, setEditing] = useState(false);
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editStatus, setEditStatus] = useState<"scheduled" | "completed" | "cancelled">("scheduled");

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader size="sm" title="Laddar möte" />
      </div>
    );
  }

  const { meeting, lead, calls } = data;

  function startEditing() {
    setEditDate(meeting.meeting_date);
    setEditTime(meeting.meeting_time?.slice(0, 5) ?? "");
    setEditNotes(meeting.notes ?? "");
    setEditStatus(meeting.status);
    setEditing(true);
  }

  function handleSave() {
    if (!id) return;
    // editTime is already "HH:MM" from TimeSelect; append seconds for API
    const timeWithSeconds = editTime.length === 5 ? editTime + ":00" : editTime;
    updateMeeting.mutate(
      {
        id,
        meeting_date: editDate,
        meeting_time: timeWithSeconds,
        notes: editNotes,
        status: editStatus,
      },
      {
        onSuccess: () => setEditing(false),
      },
    );
  }

  function handleCancel() {
    if (!id) return;
    if (confirm("Vill du avboka detta möte?")) {
      cancelMeeting.mutate(id, {
        onSuccess: () => void navigate("/meetings"),
      });
    }
  }

  function handleComplete() {
    if (!id) return;
    updateMeeting.mutate({ id, status: "completed" });
  }

  function handleRebook() {
    if (!id) return;
    // Set status back to scheduled and open edit form
    setEditDate(todayISO());
    setEditTime("10:00");
    setEditNotes(meeting.notes ?? "");
    setEditStatus("scheduled");
    setEditing(true);
  }

  // Google Maps URL with encodeURIComponent and space join
  const mapsQuery = [lead.adress, lead.postnummer, lead.stad]
    .filter(Boolean)
    .join(" ");
  const mapsUrl = mapsQuery
    ? `https://www.google.com/maps/search/${encodeURIComponent(mapsQuery)}`
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="secondary" size="default" onClick={() => void navigate("/meetings")}>
            Tillbaka
          </Button>
          <h1
            className="text-[22px] font-light tracking-[-0.5px] text-[var(--color-text-primary)]"
          >
            {meeting.title}
          </h1>
          <Badge status={meeting.status} />
          {meeting.teams_join_url && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
              Teams
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {meeting.teams_join_url && (
            <a
              href={meeting.teams_join_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center h-10 rounded-md bg-purple-600 text-white font-medium text-sm px-4 hover:bg-purple-700 transition-colors"
            >
              Gå med i Teams-möte
            </a>
          )}
          {meeting.status === "scheduled" && (
            <>
              <Button variant="primary" size="default" onClick={handleComplete}>
                Markera genomförd
              </Button>
              <Button variant="secondary" size="default" onClick={startEditing}>
                Boka om
              </Button>
              <Button variant="danger" size="default" onClick={handleCancel}>
                Avboka
              </Button>
            </>
          )}
          {(meeting.status === "cancelled" || meeting.status === "completed") && (
            <Button variant="primary" size="default" onClick={handleRebook}>
              Återställ & boka om
            </Button>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-2 gap-6">
        {/* Left: Meeting info */}
        <Card>
          <CardTitle className="mb-4">Mötesinfo</CardTitle>
          {editing ? (
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="block text-xs text-[var(--color-text-secondary)] uppercase tracking-wider">
                  Datum
                </label>
                <Input
                  type="date"
                  value={editDate}
                  min={todayISO()}
                  onChange={(e) => setEditDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs text-[var(--color-text-secondary)] uppercase tracking-wider">
                  Tid
                </label>
                <TimeSelect
                  value={editTime}
                  onChange={setEditTime}
                  disabled={updateMeeting.isPending}
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs text-[var(--color-text-secondary)] uppercase tracking-wider">
                  Status
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as typeof editStatus)}
                  className="flex w-full rounded-md border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm"
                >
                  <option value="scheduled">Planerad</option>
                  <option value="completed">Genomförd</option>
                  <option value="cancelled">Avbokad</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-xs text-[var(--color-text-secondary)] uppercase tracking-wider">
                  Anteckningar
                </label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={4}
                  className="flex w-full rounded-md border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm resize-y"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="primary" onClick={handleSave} disabled={updateMeeting.isPending}>
                  {updateMeeting.isPending ? "Sparar..." : "Spara"}
                </Button>
                <Button variant="secondary" onClick={() => setEditing(false)}>
                  Avbryt
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <InfoRow label="Datum" value={formatDate(meeting.meeting_date)} />
              <InfoRow label="Tid" value={formatTime(meeting.meeting_time)} mono />
              <InfoRow label="Längd" value={`${meeting.duration_minutes ?? 30} min`} />
              <InfoRow label="Agent" value={meeting.user_name ?? "—"} />
              {lead.epost && (
                <InfoRow
                  label="Deltagare (inbjuden)"
                  value={
                    <a
                      href={`mailto:${lead.epost}`}
                      className="text-indigo-600 hover:text-indigo-700 transition-colors"
                    >
                      {lead.epost}
                    </a>
                  }
                />
              )}
              <InfoRow label="Anteckningar" value={meeting.notes ?? "Inga anteckningar"} />
              <InfoRow
                label="Påminnelse"
                value={
                  meeting.reminded_at
                    ? `Skickad ${formatDate(meeting.reminded_at)}`
                    : "Inte skickad"
                }
              />
            </div>
          )}
        </Card>

        {/* Right: Lead info */}
        <Card>
          <div className="flex items-start justify-between mb-4">
            <CardTitle>{lead.företag}</CardTitle>
            <Badge status={lead.status} />
          </div>
          <div className="space-y-3">
            <InfoRow
              label="Telefon"
              value={
                <a
                  href={`tel:${lead.telefon}`}
                  className="font-mono text-indigo-600 hover:text-indigo-700 transition-colors"
                >
                  {formatPhone(lead.telefon)}
                </a>
              }
            />
            <InfoRow label="Adress" value={lead.adress} />
            <InfoRow label="Postnummer" value={lead.postnummer} />
            <InfoRow label="Stad" value={lead.stad} />
            <InfoRow label="Bransch" value={lead.bransch} />
            <InfoRow
              label="Omsättning"
              value={lead.omsättning_tkr != null ? `${lead.omsättning_tkr} tkr` : null}
            />
            <InfoRow label="VD" value={lead.vd_namn} />
            {lead.källa && (
              <InfoRow
                label="Källa"
                value={
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-[var(--color-bg-panel)] text-slate-700">
                    {lead.källa}
                  </span>
                }
              />
            )}
            {mapsUrl && (
              <div className="pt-2">
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full h-10 rounded-md bg-[var(--color-accent)] text-white font-medium text-sm hover:bg-[var(--color-accent-hover)] transition-colors"
                >
                  Visa på Google Maps
                </a>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* History timeline */}
      <HistoryTimeline callLogs={calls} />
    </div>
  );
}

// Helper component
function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex flex-col gap-0.5 py-2 border-b border-[var(--color-border)] last:border-0">
      <span className="text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-secondary)]">
        {label}
      </span>
      <span
        className={`text-sm text-[var(--color-text-primary)] ${mono ? "font-mono text-[13px]" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
