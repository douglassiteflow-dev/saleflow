import { useState } from "react";
import { useDailySummary, useDailyReport } from "@/api/daily-summary";
import { todayISO } from "@/lib/date";
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus, Award, Target, Lightbulb } from "lucide-react";

function formatSwedishDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" });
}

function Stars({ score }: { score: number }) {
  const s = Math.round((score / 10) * 5);
  return <span className="text-amber-400">{"★".repeat(s)}{"☆".repeat(5 - s)}</span>;
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  const pct = (score / 10) * 100;
  const color = score >= 8 ? "bg-emerald-500" : score >= 6 ? "bg-amber-400" : score >= 4 ? "bg-orange-400" : "bg-red-500";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px]">
        <span className="text-[var(--color-text-secondary)]">{label}</span>
        <span className="font-mono font-medium text-[var(--color-text-primary)]">{score.toFixed(1)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--color-bg-panel)]">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Trend({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous;
  if (Math.abs(diff) < 0.1) return <Minus className="h-3 w-3 text-slate-400" />;
  if (diff > 0) return <span className="flex items-center gap-0.5 text-[10px] text-emerald-600"><TrendingUp className="h-3 w-3" />+{diff.toFixed(1)}</span>;
  return <span className="flex items-center gap-0.5 text-[10px] text-red-500"><TrendingDown className="h-3 w-3" />{diff.toFixed(1)}</span>;
}

export function ReportTab() {
  const [date, setDate] = useState(todayISO());
  const { data, isLoading } = useDailySummary(date);
  const { data: reportData } = useDailyReport(date);
  const report = reportData?.report;
  const prevDate = (() => { const d = new Date(date + "T12:00:00"); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })();
  const { data: prevData } = useDailySummary(prevDate);

  const goBack = () => { const d = new Date(date + "T12:00:00"); d.setDate(d.getDate() - 1); setDate(d.toISOString().slice(0, 10)); };
  const goForward = () => { const d = new Date(date + "T12:00:00"); d.setDate(d.getDate() + 1); if (d.toISOString().slice(0, 10) <= todayISO()) setDate(d.toISOString().slice(0, 10)); };
  const isToday = date === todayISO();

  const calls = (data?.calls ?? []).filter(c => !c.analysis?.voicemail);
  const prevCalls = (prevData?.calls ?? []).filter(c => !c.analysis?.voicemail);

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const scores = calls.map(c => c.analysis?.score?.overall ?? 0).filter(s => s > 0);
  const prevScores = prevCalls.map(c => c.analysis?.score?.overall ?? 0).filter(s => s > 0);
  const avgScore = avg(scores);
  const prevAvgScore = avg(prevScores);

  const catAvg = (field: string) => avg(calls.map(c => (c.analysis?.score as any)?.[field]?.score ?? 0).filter(s => s > 0));
  const prevCatAvg = (field: string) => avg(prevCalls.map(c => (c.analysis?.score as any)?.[field]?.score ?? 0).filter(s => s > 0));

  const meetings = calls.filter(c => c.outcome === "meeting_booked").length;
  const convRate = calls.length > 0 ? Math.round((meetings / calls.length) * 100) : 0;

  // Aggregate tags
  const countTags = (field: string) => {
    const map = new Map<string, number>();
    calls.forEach(c => ((c.analysis as any)?.[field] ?? []).forEach((t: string) => map.set(t, (map.get(t) ?? 0) + 1)));
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  };

  const needs = countTags("customer_needs");
  const objections = countTags("objections");
  const signals = countTags("positive_signals");

  // Agent performance
  const agentMap = new Map<string, number[]>();
  calls.forEach(c => {
    const name = c.agent ?? "Okänd";
    const s = c.analysis?.score?.overall ?? 0;
    if (s > 0) agentMap.set(name, [...(agentMap.get(name) ?? []), s]);
  });
  const agents = [...agentMap.entries()].map(([name, scores]) => ({ name, avg: avg(scores), count: scores.length })).sort((a, b) => b.avg - a.avg);

  // Coaching tips
  const categories = [
    { key: "opening", label: "Öppning" },
    { key: "needs_discovery", label: "Behovsanalys" },
    { key: "pitch", label: "Pitch" },
    { key: "objection_handling", label: "Invändningshantering" },
    { key: "closing", label: "Avslut" },
  ];
  const catScores = categories.map(c => ({ ...c, score: catAvg(c.key), prev: prevCatAvg(c.key) }));
  const weakest = [...catScores].sort((a, b) => a.score - b.score)[0];
  const strongest = [...catScores].sort((a, b) => b.score - a.score)[0];
  void catScores; // trend data used in score bars

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center text-[var(--color-text-secondary)]">Laddar rapport...</div>;
  }

  if (calls.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-[var(--color-text-secondary)] gap-2">
        <p className="text-sm">Inga analyserade samtal för {formatSwedishDate(date)}</p>
        <div className="flex gap-2">
          <button onClick={goBack} className="text-[var(--color-accent)] text-sm hover:underline cursor-pointer">← Föregående dag</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)]">
        <button onClick={goBack} className="p-1 rounded hover:bg-[var(--color-bg-panel)] cursor-pointer"><ChevronLeft className="h-4 w-4" /></button>
        <div className="text-center">
          <p className="text-[13px] font-medium text-[var(--color-text-primary)] capitalize">{formatSwedishDate(date)}</p>
          {isToday && <p className="text-[10px] text-[var(--color-accent)]">Idag</p>}
        </div>
        <button onClick={goForward} disabled={isToday} className="p-1 rounded hover:bg-[var(--color-bg-panel)] cursor-pointer disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
      </div>

      <div className="p-5 space-y-5">
        {/* KPIs */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Samtal", value: calls.length },
            { label: "Snittbetyg", value: avgScore.toFixed(1), trend: true },
            { label: "Möten", value: meetings },
            { label: "Konvertering", value: `${convRate}%` },
          ].map((kpi) => (
            <div key={kpi.label} className="rounded-[10px] border border-[var(--color-border)] p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]">{kpi.label}</p>
              <div className="flex items-center justify-center gap-1.5">
                <p className="text-[20px] font-light text-[var(--color-text-primary)]">{kpi.value}</p>
                {kpi.trend && prevScores.length > 0 && <Trend current={avgScore} previous={prevAvgScore} />}
              </div>
            </div>
          ))}
        </div>

        {/* Score overview */}
        <div className="rounded-[10px] border border-[var(--color-border)] p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)] mb-3">Betygsöversikt</p>
          <div className="space-y-3">
            {catScores.map((cat) => (
              <div key={cat.key} className="flex items-center gap-2">
                <div className="flex-1"><ScoreBar label={cat.label} score={cat.score} /></div>
                {cat.prev > 0 && <Trend current={cat.score} previous={cat.prev} />}
              </div>
            ))}
          </div>
        </div>

        {/* Agents */}
        {agents.length > 0 && (
          <div className="rounded-[10px] border border-[var(--color-border)] p-4">
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)] mb-3">Agenter</p>
            <div className="space-y-2">
              {agents.map((a) => (
                <div key={a.name} className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-medium text-indigo-700">{a.name.charAt(0)}</span>
                    <span className="text-[13px] font-medium text-[var(--color-text-primary)]">{a.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Stars score={a.avg} />
                    <span className="text-[11px] font-mono text-[var(--color-text-secondary)]">{a.avg.toFixed(1)}</span>
                    <span className="text-[10px] text-[var(--color-text-secondary)]">({a.count})</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tags */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Kundbehov", tags: needs, color: "bg-blue-50 text-blue-700" },
            { label: "Invändningar", tags: objections, color: "bg-rose-50 text-rose-700" },
            { label: "Positiva signaler", tags: signals, color: "bg-emerald-50 text-emerald-700" },
          ].map((section) => (
            <div key={section.label} className="rounded-[10px] border border-[var(--color-border)] p-3">
              <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)] mb-2">{section.label}</p>
              <div className="flex flex-wrap gap-1">
                {section.tags.length > 0 ? section.tags.map(([tag, count]) => (
                  <span key={tag} className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${section.color}`}>
                    {tag} ({count})
                  </span>
                )) : <span className="text-[11px] text-[var(--color-text-secondary)]">—</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Opus AI Rapport */}
        {report ? (
          <div className="space-y-4">
            {/* Headline */}
            <div className="rounded-[10px] p-4" style={{ background: "linear-gradient(135deg, #312E81, #4F46E5)" }}>
              <p className="text-[10px] font-medium uppercase tracking-wider text-white/60 mb-1">Opus AI Rapport</p>
              <h3 className="text-[16px] font-medium text-white">{report.headline}</h3>
              <p className="text-[13px] text-white/80 mt-1 leading-relaxed">{report.summary}</p>
            </div>

            {/* Wins + Improvements */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[10px] border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-[10px] font-medium uppercase tracking-wider text-emerald-600 mb-2">Vinster idag</p>
                <ul className="space-y-1.5">
                  {report.wins?.map((w, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[12px] text-emerald-800">
                      <span className="shrink-0 mt-0.5">✅</span>{w}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-[10px] border border-amber-200 bg-amber-50 p-3">
                <p className="text-[10px] font-medium uppercase tracking-wider text-amber-600 mb-2">Att förbättra</p>
                <ul className="space-y-1.5">
                  {report.improvements?.map((imp, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[12px] text-amber-800">
                      <span className="shrink-0 mt-0.5">💡</span>{imp}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Agent Shoutouts */}
            {report.agent_shoutouts && report.agent_shoutouts.length > 0 && (
              <div className="rounded-[10px] border border-[var(--color-border)] p-3">
                <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)] mb-2">Shoutouts</p>
                {report.agent_shoutouts.map((s, i) => (
                  <div key={i} className="flex items-start gap-2 py-1">
                    <Award className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-[12px] text-[var(--color-text-primary)]"><strong>{s.agent}</strong> — {s.reason}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Focus Tomorrow */}
            <div className="rounded-[10px] p-4" style={{ background: "linear-gradient(135deg, #EEF2FF, #E0E7FF)" }}>
              <div className="flex items-start gap-2">
                <Target className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-indigo-600 mb-1">Fokus imorgon</p>
                  <p className="text-[13px] text-[var(--color-text-primary)] leading-relaxed">{report.focus_tomorrow}</p>
                </div>
              </div>
            </div>

            {/* Trend Note */}
            {report.trend_note && (
              <div className="flex items-start gap-2 px-1">
                <Lightbulb className="h-4 w-4 text-[var(--color-text-secondary)] shrink-0 mt-0.5" />
                <p className="text-[12px] text-[var(--color-text-secondary)] italic leading-relaxed">{report.trend_note}</p>
              </div>
            )}
          </div>
        ) : (
          /* Fallback: data-driven coaching when no Opus report exists */
          <div className="rounded-[10px] p-4" style={{ background: "linear-gradient(135deg, #EEF2FF, #E0E7FF)" }}>
            <p className="text-[10px] font-medium uppercase tracking-wider text-indigo-600 mb-3">AI Coaching</p>
            <div className="space-y-2.5">
              {weakest && weakest.score > 0 && (
                <div className="flex items-start gap-2">
                  <span className="text-[14px]">💡</span>
                  <p className="text-[12px] text-[var(--color-text-primary)] leading-relaxed">
                    <strong>{weakest.label}</strong> är svagaste området ({weakest.score.toFixed(1)}/10).
                  </p>
                </div>
              )}
              {strongest && strongest.score > 0 && (
                <div className="flex items-start gap-2">
                  <span className="text-[14px]">✅</span>
                  <p className="text-[12px] text-[var(--color-text-primary)] leading-relaxed">
                    <strong>{strongest.label}</strong> är starkaste ({strongest.score.toFixed(1)}/10) — fortsätt!
                  </p>
                </div>
              )}
              <p className="text-[11px] text-[var(--color-text-secondary)] italic">Opus AI-rapport genereras kl 16:00</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
