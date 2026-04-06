import { useState } from "react";
import { useDailySummary, useAgentReport } from "@/api/daily-summary";
import { todayISO } from "@/lib/date";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  PieChart, Pie, Cell, ResponsiveContainer,
} from "recharts";

const PIE_COLORS = ["#10B981", "#F59E0B", "#EF4444", "#6366F1", "#64748B", "#8B5CF6"];
const OUTCOME_LABELS: Record<string, string> = {
  meeting_booked: "Möte", callback: "Callback", not_interested: "Ej intresserad",
  no_answer: "Ej svar", call_later: "Ring senare", bad_number: "Fel nr",
};

function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" });
}

export function ReportTab() {
  const [date, setDate] = useState(todayISO());
  const { data } = useDailySummary(date);
  const { data: rd } = useAgentReport(date);
  const report = rd?.report;

  const prev = () => { const d = new Date(date + "T12:00:00"); d.setDate(d.getDate() - 1); setDate(d.toISOString().slice(0, 10)); };
  const next = () => { const d = new Date(date + "T12:00:00"); d.setDate(d.getDate() + 1); if (d.toISOString().slice(0, 10) <= todayISO()) setDate(d.toISOString().slice(0, 10)); };
  const isToday = date === todayISO();

  const calls = (data?.calls ?? []).filter(c => !c.analysis?.voicemail);
  const avg = (a: number[]) => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;

  const radar = [
    { cat: "Öppning", v: avg(calls.map(c => c.analysis?.score?.opening?.score ?? 0).filter(Boolean)) },
    { cat: "Behov", v: avg(calls.map(c => c.analysis?.score?.needs_discovery?.score ?? 0).filter(Boolean)) },
    { cat: "Pitch", v: avg(calls.map(c => c.analysis?.score?.pitch?.score ?? 0).filter(Boolean)) },
    { cat: "Invändning", v: avg(calls.map(c => c.analysis?.score?.objection_handling?.score ?? 0).filter(Boolean)) },
    { cat: "Avslut", v: avg(calls.map(c => c.analysis?.score?.closing?.score ?? 0).filter(Boolean)) },
  ];

  const outcomes = new Map<string, number>();
  calls.forEach(c => { const o = c.outcome ?? "?"; outcomes.set(o, (outcomes.get(o) ?? 0) + 1); });
  const pie = [...outcomes.entries()].map(([k, v]) => ({ name: OUTCOME_LABELS[k] ?? k, value: v }));

  const score = rd?.score_avg;
  const meetings = calls.filter(c => c.outcome === "meeting_booked").length;

  return (
    <div className="flex-1 overflow-auto bg-[#FAFAFA]">
      {/* Nav */}
      <div className="flex items-center justify-between px-6 py-4">
        <button onClick={prev} className="p-1.5 rounded-full hover:bg-black/5 cursor-pointer transition"><ChevronLeft className="h-4 w-4 text-[#86868B]" /></button>
        <div className="text-center">
          <p className="text-[15px] font-semibold text-[#1D1D1F] capitalize">{fmtDate(date)}</p>
          {isToday && <p className="text-[11px] text-[#0071E3]">Idag</p>}
        </div>
        <button onClick={next} disabled={isToday} className="p-1.5 rounded-full hover:bg-black/5 cursor-pointer transition disabled:opacity-20"><ChevronRight className="h-4 w-4 text-[#86868B]" /></button>
      </div>

      {calls.length === 0 && !report ? (
        <div className="px-6 py-16 text-center">
          <p className="text-[15px] text-[#86868B]">Inga analyserade samtal</p>
          <button onClick={prev} className="mt-3 text-[13px] text-[#0071E3] hover:underline cursor-pointer">← Föregående dag</button>
        </div>
      ) : (
        <div className="px-6 pb-8 space-y-5">

          {/* KPIs */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Samtal", value: rd?.call_count ?? calls.length },
              { label: "Snitt", value: score != null ? score.toFixed(1) : avg(calls.map(c => c.analysis?.score?.overall ?? 0).filter(Boolean)).toFixed(1) },
              { label: "Möten", value: meetings },
            ].map(k => (
              <div key={k.label} className="bg-white rounded-2xl p-4 text-center" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                <p className="text-[28px] font-light tracking-tight text-[#1D1D1F]">{k.value}</p>
                <p className="text-[11px] text-[#86868B] mt-0.5">{k.label}</p>
              </div>
            ))}
          </div>

          {/* Charts side by side */}
          {calls.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-2xl p-4" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                <p className="text-[11px] text-[#86868B] mb-1">Kompetenser</p>
                <ResponsiveContainer width="100%" height={160}>
                  <RadarChart data={radar}>
                    <PolarGrid stroke="#F1F1F1" />
                    <PolarAngleAxis dataKey="cat" tick={{ fontSize: 9, fill: "#86868B" }} />
                    <PolarRadiusAxis domain={[0, 10]} tick={false} axisLine={false} />
                    <Radar dataKey="v" stroke="#0071E3" fill="#0071E3" fillOpacity={0.12} strokeWidth={1.5} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white rounded-2xl p-4" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                <p className="text-[11px] text-[#86868B] mb-1">Utfall</p>
                <ResponsiveContainer width="100%" height={120}>
                  <PieChart>
                    <Pie data={pie} dataKey="value" cx="50%" cy="50%" outerRadius={45} innerRadius={25} paddingAngle={3} strokeWidth={0}>
                      {pie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap justify-center gap-x-3 gap-y-0.5">
                  {pie.map((d, i) => (
                    <span key={d.name} className="flex items-center gap-1 text-[10px] text-[#86868B]">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />{d.name} ({d.value})
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* AI Report */}
          {report ? (
            <div className="space-y-3">
              <div className="bg-white rounded-2xl p-5" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                <p className="text-[15px] text-[#1D1D1F] leading-relaxed">{report.greeting}</p>
                {report.score_summary && (
                  <p className="text-[13px] text-[#86868B] mt-2">{report.score_summary}</p>
                )}
              </div>

              {report.wins?.length > 0 && (
                <div className="bg-white rounded-2xl p-5" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                  <p className="text-[11px] font-medium text-[#86868B] uppercase tracking-wider mb-2">Bra idag</p>
                  {report.wins.map((w, i) => (
                    <p key={i} className="text-[13px] text-[#1D1D1F] mb-1.5 last:mb-0 leading-relaxed">{w}</p>
                  ))}
                </div>
              )}

              {report.focus_area && (
                <div className="bg-[#0071E3] rounded-2xl p-5">
                  <p className="text-[11px] font-medium text-white/60 uppercase tracking-wider mb-1">Fokus imorgon</p>
                  <p className="text-[14px] text-white leading-relaxed">{report.focus_area}</p>
                </div>
              )}

              {report.progress_note && (
                <div className="bg-white rounded-2xl p-5" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                  <p className="text-[11px] font-medium text-[#86868B] uppercase tracking-wider mb-2">Din utveckling</p>
                  <p className="text-[13px] text-[#1D1D1F] leading-relaxed">{report.progress_note}</p>
                </div>
              )}

              {report.tip_of_the_day && (
                <div className="bg-white rounded-2xl p-5" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                  <p className="text-[11px] font-medium text-[#86868B] uppercase tracking-wider mb-2">Tips</p>
                  <p className="text-[13px] text-[#1D1D1F] leading-relaxed">{report.tip_of_the_day}</p>
                </div>
              )}

              {report.motivation && (
                <p className="text-[13px] text-[#86868B] text-center italic px-4">{report.motivation}</p>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-8 text-center" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <p className="text-[15px] text-[#1D1D1F]">Dagens rapport uppdateras kl 16:10 varje vardag</p>
              <p className="text-[12px] text-[#86868B] mt-1">Bläddra bakåt för att se tidigare rapporter</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
