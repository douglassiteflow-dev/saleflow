import { useState } from "react";
import { useDailySummary, useAgentReport } from "@/api/daily-summary";
import { todayISO } from "@/lib/date";
import {
  ChevronLeft,
  ChevronRight,
  Trophy,
  Target,
  TrendingUp,
  Lightbulb,
  Sparkles,
} from "lucide-react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

const COLORS = [
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#6366F1",
  "#8B5CF6",
  "#64748B",
];
const OUTCOME_LABELS: Record<string, string> = {
  meeting_booked: "Mote",
  callback: "Callback",
  not_interested: "Ej intresserad",
  no_answer: "Ej svar",
  call_later: "Ring senare",
  bad_number: "Fel nr",
};

function formatSwedishDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("sv-SE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function ReportTab() {
  const [date, setDate] = useState(todayISO());
  const { data: summaryData, isLoading: summaryLoading } =
    useDailySummary(date);
  const { data: reportData, isLoading: reportLoading } = useAgentReport(date);

  const report = reportData?.report;
  const scoreAvg = reportData?.score_avg;
  const callCount = reportData?.call_count;

  const goBack = () => {
    const d = new Date(date + "T12:00:00");
    d.setDate(d.getDate() - 1);
    setDate(d.toISOString().slice(0, 10));
  };
  const goForward = () => {
    const d = new Date(date + "T12:00:00");
    d.setDate(d.getDate() + 1);
    if (d.toISOString().slice(0, 10) <= todayISO())
      setDate(d.toISOString().slice(0, 10));
  };
  const isToday = date === todayISO();
  const isLoading = summaryLoading || reportLoading;

  // Filter to this agent's calls (the history endpoint already filters by user for agents)
  const calls = (summaryData?.calls ?? []).filter((c) => !c.analysis?.voicemail);
  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  // Radar chart data
  const radarData = [
    {
      cat: "Oppning",
      score: avg(
        calls
          .map((c) => c.analysis?.score?.opening?.score ?? 0)
          .filter((s) => s > 0),
      ),
    },
    {
      cat: "Behov",
      score: avg(
        calls
          .map((c) => c.analysis?.score?.needs_discovery?.score ?? 0)
          .filter((s) => s > 0),
      ),
    },
    {
      cat: "Pitch",
      score: avg(
        calls
          .map((c) => c.analysis?.score?.pitch?.score ?? 0)
          .filter((s) => s > 0),
      ),
    },
    {
      cat: "Invandning",
      score: avg(
        calls
          .map((c) => c.analysis?.score?.objection_handling?.score ?? 0)
          .filter((s) => s > 0),
      ),
    },
    {
      cat: "Avslut",
      score: avg(
        calls
          .map((c) => c.analysis?.score?.closing?.score ?? 0)
          .filter((s) => s > 0),
      ),
    },
  ];

  // Pie chart data (outcomes)
  const outcomeCounts = new Map<string, number>();
  calls.forEach((c) => {
    const o = c.outcome ?? "okant";
    outcomeCounts.set(o, (outcomeCounts.get(o) ?? 0) + 1);
  });
  const pieData = [...outcomeCounts.entries()].map(([name, value]) => ({
    name: OUTCOME_LABELS[name] ?? name,
    value,
  }));

  const meetings = calls.filter(
    (c) => c.outcome === "meeting_booked",
  ).length;

  if (isLoading)
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-[var(--color-text-secondary)]">
        Laddar rapport...
      </div>
    );

  return (
    <div className="flex-1 overflow-auto">
      {/* Date nav */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)]">
        <button
          onClick={goBack}
          className="p-1 rounded hover:bg-[var(--color-bg-panel)] cursor-pointer"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-center">
          <p className="text-[13px] font-medium capitalize">
            {formatSwedishDate(date)}
          </p>
          {isToday && (
            <p className="text-[10px] text-[var(--color-accent)]">Idag</p>
          )}
        </div>
        <button
          onClick={goForward}
          disabled={isToday}
          className="p-1 rounded hover:bg-[var(--color-bg-panel)] cursor-pointer disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="p-5 space-y-5">
        {/* PERSONAL AI REPORT */}
        {report ? (
          <>
            {/* Greeting */}
            <div
              className="rounded-[10px] p-4"
              style={{
                background: "linear-gradient(135deg, #312E81, #4F46E5)",
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-white/60" />
                <p className="text-[10px] uppercase tracking-wider text-white/50">
                  Din personliga coach
                </p>
              </div>
              <p className="text-[15px] font-medium text-white leading-relaxed">
                {report.greeting}
              </p>
            </div>

            {/* Score summary + KPIs */}
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center rounded-[10px] border border-[var(--color-border)] p-3">
                <p className="text-[24px] font-light">
                  {callCount ?? calls.length}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]">
                  Samtal
                </p>
              </div>
              <div className="text-center rounded-[10px] border border-[var(--color-border)] p-3">
                <p className="text-[24px] font-light">
                  {scoreAvg != null ? scoreAvg.toFixed(1) : "--"}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]">
                  Snittbetyg
                </p>
              </div>
              <div className="text-center rounded-[10px] border border-[var(--color-border)] p-3">
                <p className="text-[24px] font-light text-emerald-600">
                  {meetings}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]">
                  Moten
                </p>
              </div>
            </div>

            {/* Score summary text */}
            {report.score_summary && (
              <div className="rounded-[10px] border border-[var(--color-border)] p-3">
                <p className="text-[12px] text-[var(--color-text-primary)] leading-relaxed">
                  {report.score_summary}
                </p>
              </div>
            )}

            {/* Radar chart */}
            {calls.length > 0 && (
              <div className="rounded-[10px] border border-[var(--color-border)] p-3">
                <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)] mb-1">
                  Dina kompetenser
                </p>
                <ResponsiveContainer width="100%" height={180}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#E2E8F0" />
                    <PolarAngleAxis
                      dataKey="cat"
                      tick={{ fontSize: 10, fill: "#64748B" }}
                    />
                    <PolarRadiusAxis
                      domain={[0, 10]}
                      tick={false}
                      axisLine={false}
                    />
                    <Radar
                      dataKey="score"
                      stroke="#4F46E5"
                      fill="#4F46E5"
                      fillOpacity={0.2}
                      strokeWidth={2}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Wins */}
            {report.wins && report.wins.length > 0 && (
              <div className="rounded-[10px] border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Trophy className="h-4 w-4 text-emerald-600" />
                  <p className="text-[11px] font-medium uppercase tracking-wider text-emerald-700">
                    Det har gjorde du bra
                  </p>
                </div>
                <div className="space-y-2">
                  {report.wins.map((w, i) => (
                    <p
                      key={i}
                      className="text-[12px] text-emerald-800 leading-relaxed"
                    >
                      {w}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Focus area */}
            {report.focus_area && (
              <div
                className="rounded-[10px] p-4"
                style={{
                  background: "linear-gradient(135deg, #FEF3C7, #FDE68A)",
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Target className="h-4 w-4 text-amber-700" />
                  <p className="text-[11px] font-medium uppercase tracking-wider text-amber-700">
                    Fokus imorgon
                  </p>
                </div>
                <p className="text-[13px] text-amber-900 leading-relaxed">
                  {report.focus_area}
                </p>
              </div>
            )}

            {/* Progress note */}
            {report.progress_note && (
              <div className="rounded-[10px] border border-[var(--color-border)] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-4 w-4 text-indigo-500" />
                  <p className="text-[11px] font-medium uppercase tracking-wider text-indigo-600">
                    Din utveckling
                  </p>
                </div>
                <p className="text-[12px] text-[var(--color-text-primary)] leading-relaxed">
                  {report.progress_note}
                </p>
              </div>
            )}

            {/* Tip of the day */}
            {report.tip_of_the_day && (
              <div
                className="rounded-[10px] p-4"
                style={{
                  background: "linear-gradient(135deg, #EEF2FF, #E0E7FF)",
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Lightbulb className="h-4 w-4 text-indigo-600" />
                  <p className="text-[11px] font-medium uppercase tracking-wider text-indigo-600">
                    Tips
                  </p>
                </div>
                <p className="text-[13px] text-[var(--color-text-primary)] leading-relaxed">
                  {report.tip_of_the_day}
                </p>
              </div>
            )}

            {/* Pie chart (outcomes) */}
            {pieData.length > 0 && (
              <div className="rounded-[10px] border border-[var(--color-border)] p-3">
                <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)] mb-1">
                  Utfall
                </p>
                <ResponsiveContainer width="100%" height={140}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      cx="50%"
                      cy="50%"
                      outerRadius={55}
                      innerRadius={30}
                      paddingAngle={2}
                    >
                      {pieData.map((_, i) => (
                        <Cell
                          key={i}
                          fill={COLORS[i % COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => `${v} st`} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-1">
                  {pieData.map((d, i) => (
                    <span
                      key={d.name}
                      className="flex items-center gap-1 text-[10px] text-[var(--color-text-secondary)]"
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{
                          background: COLORS[i % COLORS.length],
                        }}
                      />
                      {d.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Motivation */}
            {report.motivation && (
              <p className="text-[12px] text-center text-[var(--color-text-secondary)] italic px-2 pb-2">
                {report.motivation}
              </p>
            )}
          </>
        ) : (
          /* No report yet */
          <div
            className="rounded-[10px] p-6 text-center"
            style={{
              background: "linear-gradient(135deg, #EEF2FF, #E0E7FF)",
            }}
          >
            <Sparkles className="h-6 w-6 text-indigo-400 mx-auto mb-3" />
            <p className="text-[13px] font-medium text-indigo-700 mb-1">
              Dagens rapport uppdateras kl 16:10 varje vardag
            </p>
            <p className="text-[11px] text-indigo-500">
              Bläddra bakåt för att se tidigare rapporter.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
