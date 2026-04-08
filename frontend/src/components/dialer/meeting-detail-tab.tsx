import { useState } from "react";
import { useMeetingDetail, useUpdateMeeting, useCancelMeeting } from "@/api/meetings";
import { useDial } from "@/api/telavox";
import { useCreateTeamsMeeting } from "@/api/microsoft";
import { Badge } from "@/components/ui/badge";
import { HistoryTimeline } from "@/components/history-timeline";
import { formatDate, formatTime, formatPhone } from "@/lib/format";
import { todayISO } from "@/lib/date";
import Loader from "@/components/kokonutui/loader";

interface MeetingDetailTabProps {
  meetingId: string;
  onBack: () => void;
}

export function MeetingDetailTab({ meetingId, onBack }: MeetingDetailTabProps) {
  const { data, isLoading } = useMeetingDetail(meetingId);
  const updateMeeting = useUpdateMeeting();
  const cancelMeeting = useCancelMeeting();
  const dial = useDial();
  const createTeamsMeeting = useCreateTeamsMeeting();

  const [editing, setEditing] = useState(false);
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editNotes, setEditNotes] = useState("");

  if (isLoading || !data) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader size="sm" title="Laddar möte..." />
      </div>
    );
  }

  const { meeting, lead, calls } = data;

  function startEditing() {
    setEditDate(meeting.meeting_date);
    setEditTime(meeting.meeting_time?.slice(0, 5) ?? "");
    setEditNotes(meeting.notes ?? "");
    setEditing(true);
  }

  function handleSave() {
    const timeWithSeconds = editTime.length === 5 ? editTime + ":00" : editTime;
    updateMeeting.mutate(
      { id: meetingId, meeting_date: editDate, meeting_time: timeWithSeconds, notes: editNotes, status: "scheduled" },
      { onSuccess: () => setEditing(false) },
    );
  }

  function handleCancel() {
    if (confirm("Vill du avboka detta möte?")) {
      cancelMeeting.mutate(meetingId);
    }
  }

  function handleComplete() {
    updateMeeting.mutate({ id: meetingId, status: "completed" });
  }

  function handleRebook() {
    setEditDate(todayISO());
    setEditTime("10:00");
    setEditNotes(meeting.notes ?? "");
    setEditing(true);
  }

  return (
    <div className="flex-1 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} className="text-[13px] text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] transition-colors cursor-pointer">
            ← Möten
          </button>
          <span className="text-[var(--color-border)]">|</span>
          <span className="text-[13px] font-medium text-[var(--color-text-primary)]">{meeting.title}</span>
          <Badge status={meeting.status} />
          {meeting.teams_join_url && (
            <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200">Teams</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {meeting.status === "scheduled" && lead.id && (
            <button
              type="button"
              onClick={() => dial.mutate(lead.id)}
              disabled={dial.isPending}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1 text-[11px] font-medium text-white hover:brightness-110 transition-all disabled:opacity-50"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              {dial.isPending ? "Ringer..." : "Ring"}
            </button>
          )}
          {meeting.status === "scheduled" && !meeting.teams_join_url && (
            <button
              type="button"
              onClick={() => createTeamsMeeting.mutate({ meetingId })}
              disabled={createTeamsMeeting.isPending}
              className="rounded-md bg-purple-600 px-3 py-1 text-[11px] font-medium text-white hover:brightness-110 transition-all disabled:opacity-50"
            >
              {createTeamsMeeting.isPending ? "Skapar..." : "Skicka Teams-inbjudan"}
            </button>
          )}
          {meeting.teams_join_url && (
            <a href={meeting.teams_join_url} target="_blank" rel="noopener noreferrer" className="rounded-md bg-purple-600 px-3 py-1 text-[11px] font-medium text-white hover:brightness-110 transition-all no-underline">
              Teams ↗
            </a>
          )}
          {meeting.status === "scheduled" && !editing && (
            <>
              <button type="button" onClick={handleComplete} className="rounded-md bg-[var(--color-success)] px-3 py-1 text-[11px] font-medium text-white hover:brightness-110 transition-all">
                Genomförd
              </button>
              <button type="button" onClick={startEditing} className="rounded-md bg-[var(--color-accent)] px-3 py-1 text-[11px] font-medium text-white hover:brightness-110 transition-all">
                Boka om
              </button>
              <button type="button" onClick={handleCancel} disabled={cancelMeeting.isPending} className="rounded-md bg-[var(--color-danger)] px-3 py-1 text-[11px] font-medium text-white hover:brightness-110 transition-all">
                Avboka
              </button>
            </>
          )}
          {(meeting.status === "cancelled" || meeting.status === "completed") && (
            <button type="button" onClick={handleRebook} className="rounded-md bg-[var(--color-accent)] px-3 py-1 text-[11px] font-medium text-white hover:brightness-110 transition-all">
              Återställ & boka om
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2">
        {/* Left: Meeting info */}
        <div className="p-5 border-r border-[var(--color-border)]">
          <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)] mb-3">Mötesinfo</p>

          {editing ? (
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)] mb-1">Datum</label>
                <input type="date" value={editDate} min={todayISO()} onChange={(e) => setEditDate(e.target.value)} className="h-8 w-full rounded-md border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-3 text-[13px]" />
              </div>
              <div>
                <label className="block text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)] mb-1">Tid</label>
                <input type="time" value={editTime} onChange={(e) => setEditTime(e.target.value)} className="h-8 w-full rounded-md border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-3 text-[13px]" />
              </div>
              <div>
                <label className="block text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)] mb-1">Anteckningar</label>
                <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={3} className="w-full rounded-md border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-3 py-2 text-[13px] resize-y" />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={handleSave} disabled={updateMeeting.isPending} className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[11px] font-medium text-white hover:brightness-110 transition-all">
                  {updateMeeting.isPending ? "Sparar..." : "Spara"}
                </button>
                <button type="button" onClick={() => setEditing(false)} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-[11px] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-panel)] transition-colors">
                  Avbryt
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-0">
              <DetailRow label="Datum" value={formatDate(meeting.meeting_date)} />
              <DetailRow label="Tid" value={formatTime(meeting.meeting_time)} mono />
              <DetailRow label="Längd" value={`${meeting.duration_minutes ?? 30} min`} />
              <DetailRow label="Agent" value={meeting.user_name ?? "—"} />
              {meeting.attendee_name && <DetailRow label="Kontakt" value={meeting.attendee_name} />}
              {meeting.attendee_email && <DetailRow label="E-post" value={meeting.attendee_email} />}
              <DetailRow label="Anteckningar" value={meeting.notes ?? "Inga"} />
              <DetailRow label="Påminnelse" value={meeting.reminded_at ? `Skickad ${formatDate(meeting.reminded_at)}` : "Inte skickad"} />
            </div>
          )}
        </div>

        {/* Right: Lead info */}
        <div className="p-5">
          <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)] mb-3">{lead.företag}</p>
          <div className="space-y-0">
            <DetailRow label="Telefon" value={formatPhone(lead.telefon)} mono />
            {lead.adress && <DetailRow label="Adress" value={lead.adress} />}
            {lead.stad && <DetailRow label="Stad" value={lead.stad} />}
            {lead.bransch && <DetailRow label="Bransch" value={lead.bransch} />}
            {lead.omsättning_tkr && <DetailRow label="Omsättning" value={`${lead.omsättning_tkr} tkr`} />}
            {lead.vd_namn && <DetailRow label="VD" value={lead.vd_namn} />}
            {lead.källa && <DetailRow label="Källa" value={lead.källa} />}
          </div>
        </div>
      </div>

      {/* Call history */}
      <div className="border-t border-[var(--color-border)] p-5">
        <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)] mb-3">Samtalshistorik</p>
        {calls && calls.length > 0 ? (
          <HistoryTimeline callLogs={calls} bare />
        ) : (
          <p className="text-sm text-[var(--color-text-secondary)]">Inga samtal med denna kund.</p>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline py-2 border-b border-[var(--color-border)] last:border-0">
      <span className="w-24 shrink-0 text-[11px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)]">{label}</span>
      <span className={`text-[13px] text-[var(--color-text-primary)] ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
