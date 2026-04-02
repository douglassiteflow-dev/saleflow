import type { Meeting } from "@/api/types";
import { cn } from "@/lib/cn";

interface MeetingCalendarProps {
  meetings: Meeting[];
  currentMonth: Date;
  onMonthChange: (date: Date) => void;
  onMeetingClick: (id: string) => void;
}

const WEEKDAYS = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];
const MONTH_NAMES = [
  "Januari", "Februari", "Mars", "April", "Maj", "Juni",
  "Juli", "Augusti", "September", "Oktober", "November", "December",
];

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  // Day of week, Monday = 0
  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: (number | null)[] = [];

  for (let i = 0; i < startDow; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);
  // Pad to complete last week
  while (days.length % 7 !== 0) days.push(null);

  return days;
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-indigo-100 text-indigo-700 border-indigo-200",
  completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  cancelled: "bg-red-100 text-red-400 border-red-200 line-through",
};

export function MeetingCalendar({ meetings, currentMonth, onMonthChange, onMeetingClick }: MeetingCalendarProps) {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const days = getMonthDays(year, month);
  const todayStr = new Date().toISOString().slice(0, 10);

  // Group meetings by date
  const meetingsByDate = new Map<string, Meeting[]>();
  for (const m of meetings) {
    const key = m.meeting_date;
    const arr = meetingsByDate.get(key) ?? [];
    arr.push(m);
    meetingsByDate.set(key, arr);
  }

  function prevMonth() {
    onMonthChange(new Date(year, month - 1, 1));
  }

  function nextMonth() {
    onMonthChange(new Date(year, month + 1, 1));
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={prevMonth}
          className="px-3 py-1.5 text-sm font-medium rounded-md border border-[var(--color-border)] hover:bg-slate-50 transition-colors"
        >
          &larr;
        </button>
        <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
          {MONTH_NAMES[month]} {year}
        </h3>
        <button
          type="button"
          onClick={nextMonth}
          className="px-3 py-1.5 text-sm font-medium rounded-md border border-[var(--color-border)] hover:bg-slate-50 transition-colors"
        >
          &rarr;
        </button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-px bg-[var(--color-border)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        {/* Weekday headers */}
        {WEEKDAYS.map((d) => (
          <div key={d} className="bg-slate-50 px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
            {d}
          </div>
        ))}

        {/* Day cells */}
        {days.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} className="bg-white min-h-[80px]" />;
          }

          const key = dateKey(year, month, day);
          const isToday = key === todayStr;
          const dayMeetings = meetingsByDate.get(key) ?? [];

          return (
            <div
              key={key}
              className={cn(
                "bg-white min-h-[80px] p-1.5",
                isToday && "bg-indigo-50/50",
              )}
            >
              <span
                className={cn(
                  "inline-flex items-center justify-center w-6 h-6 text-xs font-medium rounded-full mb-1",
                  isToday
                    ? "bg-indigo-600 text-white"
                    : "text-[var(--color-text-secondary)]",
                )}
              >
                {day}
              </span>
              <div className="space-y-0.5">
                {dayMeetings.slice(0, 3).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onMeetingClick(m.id)}
                    className={cn(
                      "block w-full text-left px-1.5 py-0.5 rounded text-[10px] font-medium border truncate cursor-pointer hover:opacity-80 transition-opacity",
                      STATUS_COLORS[m.status] ?? "bg-slate-100 text-slate-700",
                    )}
                    title={`${m.meeting_time?.slice(0, 5)} ${m.title} — ${m.lead?.företag ?? ""}`}
                  >
                    {m.meeting_time?.slice(0, 5)} {m.title}
                  </button>
                ))}
                {dayMeetings.length > 3 && (
                  <span className="block text-[10px] text-[var(--color-text-secondary)] pl-1">
                    +{dayMeetings.length - 3} till
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
