import { useState } from "react";
import { formatDate, formatTime, formatDateTime } from "@/lib/format";
import { TabToolbar, usePagination, type DateRange } from "@/components/dialer/tab-toolbar";
import { Badge } from "@/components/ui/badge";
import { useMeetings, useCancelMeeting } from "@/api/meetings";
import { todayISO } from "@/lib/date";
import Loader from "@/components/kokonutui/loader";

interface MeetingsTabProps {
  dateRange: DateRange;
  onDateRangeChange: (r: DateRange) => void;
  activePreset?: string | null;
  onPresetChange?: (label: string) => void;
  onMeetingClick: (id: string) => void;
}

export function MeetingsTab({
  dateRange,
  onDateRangeChange,
  activePreset,
  onPresetChange,
  onMeetingClick,
}: MeetingsTabProps) {
  const { data: meetings, isLoading } = useMeetings();
  const cancelMeeting = useCancelMeeting();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const forDate = (meetings ?? []).filter((m) => {
    const d = m.inserted_at.slice(0, 10);
    return d >= dateRange.from && d <= dateRange.to;
  });

  const upcoming = (meetings ?? []).filter(
    (m) => m.status === "scheduled" && m.meeting_date >= todayISO(),
  ).sort((a, b) => a.meeting_date.localeCompare(b.meeting_date) || a.meeting_time.localeCompare(b.meeting_time));

  const { totalPages, totalCount, paginate } = usePagination(forDate, search, (m, q) =>
    m.title.toLowerCase().includes(q) || (m.lead?.företag ?? "").toLowerCase().includes(q),
  );
  const visible = paginate(page);

  function handleCancel(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (confirm("Vill du avboka detta möte?")) {
      void cancelMeeting.mutate(id);
    }
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left: Meetings table */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <TabToolbar
          title="Möten"
          search={search}
          onSearchChange={(v) => { setSearch(v); setPage(1); }}
          searchPlaceholder="Sök möte..."
          dateRange={dateRange}
          onDateRangeChange={(r) => { onDateRangeChange(r); setPage(1); }}
          activePreset={activePreset}
          onPresetChange={onPresetChange}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          totalCount={totalCount}
        />
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="p-5"><Loader size="sm" title="Laddar möten..." /></div>
          ) : visible.length === 0 ? (
            <p className="p-5 text-sm text-[var(--color-text-secondary)]">
              Inga möten för vald period.
            </p>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-[var(--color-bg-panel)]">
                  {["Skapad", "Mötesdatum", "Tid", "Företag", "Status", ""].map((h) => (
                    <th key={h} className="px-5 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((meeting) => (
                  <tr key={meeting.id} className="border-t border-[var(--color-border)] cursor-pointer transition-colors hover:bg-[var(--color-bg-panel)]" onClick={() => onMeetingClick(meeting.id)}>
                    <td className="px-5 py-2.5 font-mono text-xs text-[var(--color-text-secondary)]">{formatDateTime(meeting.inserted_at)}</td>
                    <td className="px-5 py-2.5 text-[var(--color-text-primary)]">{formatDate(meeting.meeting_date)}</td>
                    <td className="px-5 py-2.5 font-mono text-xs text-[var(--color-text-secondary)]">{formatTime(meeting.meeting_time)}</td>
                    <td className="px-5 py-2.5 text-[var(--color-text-primary)]">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{meeting.lead?.företag ?? meeting.title}</span>
                        {meeting.teams_join_url && <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200">Teams</span>}
                      </div>
                    </td>
                    <td className="px-5 py-2.5"><Badge status={meeting.status} /></td>
                    <td className="px-5 py-2.5 text-right">
                      {meeting.status === "scheduled" && (
                        <button type="button" className="rounded-md bg-[var(--color-danger)] px-3 py-1 text-[11px] font-medium text-white hover:brightness-110 transition-all" onClick={(e) => handleCancel(meeting.id, e)} disabled={cancelMeeting.isPending}>Avboka</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Right: Upcoming meetings calendar */}
      <div className="w-64 shrink-0 border-l border-[var(--color-border)] overflow-auto">
        <div className="px-4 py-2.5 bg-[var(--color-bg-panel)] border-b border-[var(--color-border)]">
          <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)]">Kommande möten</p>
        </div>
        <div className="p-3 space-y-2">
          {upcoming.length === 0 ? (
            <p className="text-xs text-[var(--color-text-secondary)]">Inga kommande möten.</p>
          ) : (
            upcoming.slice(0, 15).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onMeetingClick(m.id)}
                className="w-full text-left rounded-md border border-[var(--color-border)] p-2.5 hover:bg-[var(--color-bg-panel)] transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-[10px] text-[var(--color-text-secondary)]">{formatDate(m.meeting_date)}</span>
                  <span className="font-mono text-[10px] text-[var(--color-accent)]">{formatTime(m.meeting_time)}</span>
                </div>
                <p className="text-xs font-medium text-[var(--color-text-primary)] truncate">{m.lead?.företag ?? m.title}</p>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
