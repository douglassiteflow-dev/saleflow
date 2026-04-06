import { useState } from "react";
import { useDailySummary, useDailyReport } from "@/api/daily-summary";
import { todayISO } from "@/lib/date";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  PieChart, Pie, Cell, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip,
} from "recharts";

const COLORS = ["#10B981", "#F59E0B", "#EF4444", "#6366F1", "#8B5CF6", "#64748B"];
const OUTCOME_LABELS: Record<string, string> = {
  meeting_booked: "Möte", callback: "Callback", not_interested: "Ej intresserad",
  no_answer: "Ej svar", call_later: "Ring senare", bad_number: "Fel nr",
};

function formatSwedishDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" });
}

export function ReportTab() {
  const [date, setDate] = useState(todayISO());
  const { data, isLoading } = useDailySummary(date);
  const { data: reportData } = useDailyReport(date);
  const report = reportData?.report;

  const goBack = () => { const d = new Date(date + "T12:00:00"); d.setDate(d.getDate() - 1); setDate(d.toISOString().slice(0, 10)); };
  const goForward = () => { const d = new Date(date + "T12:00:00"); d.setDate(d.getDate() + 1); if (d.toISOString().slice(0, 10) <= todayISO()) setDate(d.toISOString().slice(0, 10)); };
  const isToday = date === todayISO();

  const calls = (data?.calls ?? []).filter(c => !c.analysis?.voicemail);
  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  // Radar chart data
  const radarData = [
    { cat: "Öppning", score: avg(calls.map(c => c.analysis?.score?.opening?.score ?? 0).filter(s => s > 0)) },
    { cat: "Behov", score: avg(calls.map(c => c.analysis?.score?.needs_discovery?.score ?? 0).filter(s => s > 0)) },
    { cat: "Pitch", score: avg(calls.map(c => c.analysis?.score?.pitch?.score ?? 0).filter(s => s > 0)) },
    { cat: "Invändning", score: avg(calls.map(c => c.analysis?.score?.objection_handling?.score ?? 0).filter(s => s > 0)) },
    { cat: "Avslut", score: avg(calls.map(c => c.analysis?.score?.closing?.score ?? 0).filter(s => s > 0)) },
  ];

  // Pie chart data (outcomes)
  const outcomeCounts = new Map<string, number>();
  calls.forEach(c => { const o = c.outcome ?? "okänt"; outcomeCounts.set(o, (outcomeCounts.get(o) ?? 0) + 1); });
  const pieData = [...outcomeCounts.entries()].map(([name, value]) => ({ name: OUTCOME_LABELS[name] ?? name, value }));

  // Agent bar chart
  const agentMap = new Map<string, number[]>();
  calls.forEach(c => { const n = c.agent ?? "Okänd"; const s = c.analysis?.score?.overall ?? 0; if (s > 0) agentMap.set(n, [...(agentMap.get(n) ?? []), s]); });
  const agentData = [...agentMap.entries()].map(([name, scores]) => ({ name: name.split(" ")[0], score: Math.round(avg(scores) * 10) / 10, calls: scores.length })).sort((a, b) => b.score - a.score);

  const overallAvg = avg(calls.map(c => c.analysis?.score?.overall ?? 0).filter(s => s > 0));
  const meetings = calls.filter(c => c.outcome === "meeting_booked").length;

  if (isLoading) return <div className="flex-1 flex items-center justify-center text-sm text-[var(--color-text-secondary)]">Laddar rapport...</div>;

  if (calls.length === 0) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-[var(--color-text-secondary)]">
      <p className="text-sm">Inga analyserade samtal för {formatSwedishDate(date)}</p>
      <button onClick={goBack} className="text-[var(--color-accent)] text-sm hover:underline cursor-pointer">← Föregående dag</button>
    </div>
  );

  return (
    <div className="flex-1 overflow-auto">
      {/* Date nav */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)]">
        <button onClick={goBack} className="p-1 rounded hover:bg-[var(--color-bg-panel)] cursor-pointer"><ChevronLeft className="h-4 w-4" /></button>
        <div className="text-center">
          <p className="text-[13px] font-medium capitalize">{formatSwedishDate(date)}</p>
          {isToday && <p className="text-[10px] text-[var(--color-accent)]">Idag</p>}
        </div>
        <button onClick={goForward} disabled={isToday} className="p-1 rounded hover:bg-[var(--color-bg-panel)] cursor-pointer disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
      </div>

      <div className="p-5 space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center rounded-[10px] border border-[var(--color-border)] p-3">
            <p className="text-[24px] font-light">{calls.length}</p>
            <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]">Samtal</p>
          </div>
          <div className="text-center rounded-[10px] border border-[var(--color-border)] p-3">
            <p className="text-[24px] font-light">{overallAvg.toFixed(1)}</p>
            <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]">Snittbetyg</p>
          </div>
          <div className="text-center rounded-[10px] border border-[var(--color-border)] p-3">
            <p className="text-[24px] font-light text-emerald-600">{meetings}</p>
            <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]">Möten</p>
          </div>
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-2 gap-4">
          {/* Radar */}
          <div className="rounded-[10px] border border-[var(--color-border)] p-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)] mb-1">Kompetenser</p>
            <ResponsiveContainer width="100%" height={180}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#E2E8F0" />
                <PolarAngleAxis dataKey="cat" tick={{ fontSize: 10, fill: "#64748B" }} />
                <PolarRadiusAxis domain={[0, 10]} tick={false} axisLine={false} />
                <Radar dataKey="score" stroke="#4F46E5" fill="#4F46E5" fillOpacity={0.2} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* Pie */}
          <div className="rounded-[10px] border border-[var(--color-border)] p-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)] mb-1">Utfall</p>
            <ResponsiveContainer width="100%" height={140}>
              <PieChart>
                <Pie data={pieData} dataKey="value" cx="50%" cy="50%" outerRadius={55} innerRadius={30} paddingAngle={2}>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => `${v} st`} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-1">
              {pieData.map((d, i) => (
                <span key={d.name} className="flex items-center gap-1 text-[10px] text-[var(--color-text-secondary)]">
                  <span className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                  {d.name}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Agent bars */}
        {agentData.length > 0 && (
          <div className="rounded-[10px] border border-[var(--color-border)] p-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)] mb-2">Agenter</p>
            <ResponsiveContainer width="100%" height={agentData.length * 40 + 10}>
              <BarChart data={agentData} layout="vertical" margin={{ left: 0, right: 10 }}>
                <XAxis type="number" domain={[0, 10]} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={60} />
                <Tooltip formatter={(v) => `${v}/10`} />
                <Bar dataKey="score" fill="#4F46E5" radius={[0, 4, 4, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* AI Rapport */}
        {report ? (
          <div className="space-y-4">
            <div className="rounded-[10px] p-4" style={{ background: "linear-gradient(135deg, #312E81, #4F46E5)" }}>
              <p className="text-[10px] uppercase tracking-wider text-white/50 mb-1">AI Dagsrapport</p>
              <h3 className="text-[15px] font-medium text-white">{report.headline}</h3>
              <p className="text-[12px] text-white/80 mt-2 leading-relaxed">{report.summary}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[10px] border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-[10px] font-medium uppercase tracking-wider text-emerald-600 mb-2">Det här gick bra</p>
                {report.wins?.map((w, i) => (
                  <p key={i} className="text-[12px] text-emerald-800 mb-1">✅ {w}</p>
                ))}
              </div>
              <div className="rounded-[10px] border border-amber-200 bg-amber-50 p-3">
                <p className="text-[10px] font-medium uppercase tracking-wider text-amber-600 mb-2">Tänk på imorgon</p>
                {report.improvements?.map((imp, i) => (
                  <p key={i} className="text-[12px] text-amber-800 mb-1">💡 {imp}</p>
                ))}
              </div>
            </div>

            {report.agent_shoutouts?.length > 0 && (
              <div className="rounded-[10px] border border-[var(--color-border)] p-3">
                {report.agent_shoutouts.map((s, i) => (
                  <p key={i} className="text-[12px] mb-1">⭐ <strong>{s.agent}</strong> — {s.reason}</p>
                ))}
              </div>
            )}

            <div className="rounded-[10px] p-4" style={{ background: "linear-gradient(135deg, #EEF2FF, #E0E7FF)" }}>
              <p className="text-[10px] font-medium uppercase tracking-wider text-indigo-600 mb-1">Fokus imorgon</p>
              <p className="text-[13px] text-[var(--color-text-primary)] leading-relaxed">{report.focus_tomorrow}</p>
            </div>

            {report.trend_note && (
              <p className="text-[11px] text-[var(--color-text-secondary)] italic px-1">{report.trend_note}</p>
            )}
          </div>
        ) : (
          <div className="rounded-[10px] p-4 text-center" style={{ background: "linear-gradient(135deg, #EEF2FF, #E0E7FF)" }}>
            <p className="text-[12px] text-indigo-600">AI-rapporten genereras kl 16:00</p>
          </div>
        )}
      </div>
    </div>
  );
}
