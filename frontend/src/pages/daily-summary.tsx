import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Lightbulb } from "lucide-react";
import { useDailySummary } from "@/api/daily-summary";
import type { CallAnalysis } from "@/api/daily-summary";
import { StatCard } from "@/components/stat-card";
import { Card, CardTitle } from "@/components/ui/card";
import { OUTCOME_LABELS, OUTCOME_DOT_COLORS } from "@/lib/constants";
import { ScoreBar } from "@/components/score-bar";
import { todayISO } from "@/lib/date";
import Loader from "@/components/kokonutui/loader";

/* ------------------------------------------------------------------ */
/*  Date helpers                                                       */
/* ------------------------------------------------------------------ */

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatSwedishDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("sv-SE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}


/* ------------------------------------------------------------------ */
/*  Aggregation logic                                                  */
/* ------------------------------------------------------------------ */

interface AgentStats {
  name: string;
  calls: number;
  avgScore: number;
}

interface AggregatedData {
  totalCalls: number;
  avgOverall: number;
  meetingsBooked: number;
  conversionRate: number;
  avgScores: {
    opening: number;
    needs_discovery: number;
    pitch: number;
    objection_handling: number;
    closing: number;
  };
  outcomeCounts: Record<string, number>;
  agents: AgentStats[];
  customerNeeds: [string, number][];
  objections: [string, number][];
  positiveSignals: [string, number][];
  coachingTips: string[];
}

function aggregate(calls: CallAnalysis[]): AggregatedData {
  // Filter out voicemail calls for scoring
  const scoredCalls = calls.filter(
    (c) => !c.analysis.voicemail && c.analysis.score?.overall != null,
  );

  const totalCalls = calls.length;
  const avgOverall =
    scoredCalls.length > 0
      ? scoredCalls.reduce((s, c) => s + (c.analysis.score?.overall ?? 0), 0) /
        scoredCalls.length
      : 0;

  // Outcome counts
  const outcomeCounts: Record<string, number> = {};
  for (const c of calls) {
    const key = c.outcome ?? "unknown";
    outcomeCounts[key] = (outcomeCounts[key] ?? 0) + 1;
  }

  const meetingsBooked = outcomeCounts["meeting_booked"] ?? 0;
  const conversionRate = totalCalls > 0 ? Math.round((meetingsBooked / totalCalls) * 100) : 0;

  // Category averages
  const catSums = { opening: 0, needs_discovery: 0, pitch: 0, objection_handling: 0, closing: 0 };
  const catCounts = { opening: 0, needs_discovery: 0, pitch: 0, objection_handling: 0, closing: 0 };

  for (const c of scoredCalls) {
    const sc = c.analysis.score;
    if (!sc) continue;
    for (const key of Object.keys(catSums) as (keyof typeof catSums)[]) {
      const val = sc[key];
      if (val && typeof val.score === "number") {
        catSums[key] += val.score;
        catCounts[key] += 1;
      }
    }
  }

  const avgScores = {
    opening: catCounts.opening > 0 ? catSums.opening / catCounts.opening : 0,
    needs_discovery:
      catCounts.needs_discovery > 0 ? catSums.needs_discovery / catCounts.needs_discovery : 0,
    pitch: catCounts.pitch > 0 ? catSums.pitch / catCounts.pitch : 0,
    objection_handling:
      catCounts.objection_handling > 0
        ? catSums.objection_handling / catCounts.objection_handling
        : 0,
    closing: catCounts.closing > 0 ? catSums.closing / catCounts.closing : 0,
  };

  // Agent stats
  const agentMap = new Map<string, { scores: number[]; count: number }>();
  for (const c of calls) {
    const name = c.agent ?? "Okänd";
    const entry = agentMap.get(name) ?? { scores: [], count: 0 };
    entry.count += 1;
    if (!c.analysis.voicemail && c.analysis.score?.overall != null) {
      entry.scores.push(c.analysis.score.overall);
    }
    agentMap.set(name, entry);
  }

  const agents: AgentStats[] = Array.from(agentMap.entries())
    .map(([name, data]) => ({
      name,
      calls: data.count,
      avgScore:
        data.scores.length > 0
          ? data.scores.reduce((a, b) => a + b, 0) / data.scores.length
          : 0,
    }))
    .sort((a, b) => b.avgScore - a.avgScore);

  // Aggregate tags
  const needsMap = new Map<string, number>();
  const objectionsMap = new Map<string, number>();
  const signalsMap = new Map<string, number>();

  for (const c of calls) {
    for (const n of c.analysis.customer_needs ?? []) {
      needsMap.set(n, (needsMap.get(n) ?? 0) + 1);
    }
    for (const o of c.analysis.objections ?? []) {
      objectionsMap.set(o, (objectionsMap.get(o) ?? 0) + 1);
    }
    for (const s of c.analysis.positive_signals ?? []) {
      signalsMap.set(s, (signalsMap.get(s) ?? 0) + 1);
    }
  }

  const sortDesc = (m: Map<string, number>): [string, number][] =>
    Array.from(m.entries()).sort((a, b) => b[1] - a[1]);

  const customerNeeds = sortDesc(needsMap);
  const objections = sortDesc(objectionsMap);
  const positiveSignals = sortDesc(signalsMap);

  // Coaching tips derived from data
  const coachingTips: string[] = [];

  const categoryLabels: Record<string, string> = {
    opening: "Öppning",
    needs_discovery: "Behovsanalys",
    pitch: "Pitch",
    objection_handling: "Invändningshantering",
    closing: "Avslut",
  };

  if (scoredCalls.length > 0) {
    // Find weakest category
    const categories = Object.entries(avgScores).filter(([, v]) => v > 0);
    if (categories.length > 0) {
      const weakest = categories.reduce((a, b) => (a[1] < b[1] ? a : b));
      const strongest = categories.reduce((a, b) => (a[1] > b[1] ? a : b));

      const weakLabel = categoryLabels[weakest[0]] ?? weakest[0];
      const strongLabel = categoryLabels[strongest[0]] ?? strongest[0];

      coachingTips.push(
        `${weakLabel} är teamets svagaste punkt (${weakest[1].toFixed(1)}). Fokusera på att förbättra detta imorgon.`,
      );

      coachingTips.push(
        `${strongLabel} är er styrka (${strongest[1].toFixed(1)}) — fortsätt på samma sätt!`,
      );
    }

    // Tip about top objection
    const topObjection = objections[0];
    if (topObjection) {
      coachingTips.push(
        `${topObjection[1]} samtal fick invändningen "${topObjection[0]}". Förbered ett starkare svar på detta.`,
      );
    }

    // Tip about conversion
    if (conversionRate < 50 && totalCalls >= 3) {
      coachingTips.push(
        `Konverteringsgraden ligger på ${conversionRate}%. Jobba med avsluten för att öka antalet bokade möten.`,
      );
    }
  }

  return {
    totalCalls,
    avgOverall,
    meetingsBooked,
    conversionRate,
    avgScores,
    outcomeCounts,
    agents,
    customerNeeds,
    objections,
    positiveSignals,
    coachingTips,
  };
}

/* ------------------------------------------------------------------ */
/*  Tag cloud                                                          */
/* ------------------------------------------------------------------ */

function TagCloud({
  items,
  color,
}: {
  items: [string, number][];
  color: string;
}) {
  if (items.length === 0) {
    return (
      <p className="text-[13px] text-[var(--color-text-secondary)] italic">Inga data</p>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {items.slice(0, 10).map(([text, count]) => (
        <span
          key={text}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium ${color}`}
        >
          {text}
          <span className="opacity-60">({count})</span>
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stars                                                              */
/* ------------------------------------------------------------------ */

function Stars({ score, max = 10 }: { score: number; max?: number }) {
  const stars = Math.round((score / max) * 5);
  return (
    <span className="text-amber-400">
      {"★".repeat(Math.max(0, stars))}
      {"☆".repeat(Math.max(0, 5 - stars))}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export function DailySummaryPage() {
  const [date, setDate] = useState(todayISO);
  const { data, isLoading } = useDailySummary(date);
  const isToday = date === todayISO();

  const agg = useMemo(() => {
    if (!data?.calls) return null;
    return aggregate(data.calls);
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Header + date navigation */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-light tracking-[-0.5px] text-[var(--color-text-primary)]">
            Dagssammanfattning
          </h1>
          <p className="mt-0.5 text-[13px] text-[var(--color-text-secondary)] capitalize">
            {formatSwedishDate(date)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDate((d) => shiftDate(d, -1))}
            className="flex items-center gap-1 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-1.5 text-[13px] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-panel)] transition-colors cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" />
            Föregående
          </button>
          <button
            onClick={() => setDate((d) => shiftDate(d, 1))}
            disabled={isToday}
            className="flex items-center gap-1 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-1.5 text-[13px] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-panel)] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Nästa
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader size="sm" title="Laddar sammanfattning..." />
        </div>
      ) : !agg || agg.totalCalls === 0 ? (
        <Card>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Inga analyserade samtal för {formatSwedishDate(date)}.
          </p>
        </Card>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-4 gap-[var(--spacing-element)]">
            <StatCard label="Samtal" value={agg.totalCalls} />
            <StatCard
              label="Snittbetyg"
              value={agg.avgOverall > 0 ? agg.avgOverall.toFixed(1) : "—"}
            />
            <StatCard label="Möten" value={agg.meetingsBooked} />
            <StatCard label="Konvertering" value={agg.conversionRate} suffix="%" />
          </div>

          <div className="grid grid-cols-2 gap-[var(--spacing-element)]">
            {/* Score overview */}
            <Card>
              <CardTitle className="mb-5">Betygsöversikt</CardTitle>
              <div className="space-y-4">
                <ScoreBar label="Öppning" score={agg.avgScores.opening} />
                <ScoreBar label="Behovsanalys" score={agg.avgScores.needs_discovery} />
                <ScoreBar label="Pitch" score={agg.avgScores.pitch} />
                <ScoreBar label="Invändningshantering" score={agg.avgScores.objection_handling} />
                <ScoreBar label="Avslut" score={agg.avgScores.closing} />
              </div>
            </Card>

            {/* Outcome distribution */}
            <Card>
              <CardTitle className="mb-5">Utfall</CardTitle>
              <div className="space-y-3">
                {Object.entries(agg.outcomeCounts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([outcome, count]) => {
                    const pct =
                      agg.totalCalls > 0 ? Math.round((count / agg.totalCalls) * 100) : 0;
                    const dotColor = OUTCOME_DOT_COLORS[outcome] ?? "bg-slate-400";

                    return (
                      <div key={outcome} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className={`h-2.5 w-2.5 rounded-full ${dotColor}`} />
                            <span className="text-[13px] text-[var(--color-text-primary)]">
                              {OUTCOME_LABELS[outcome] ?? outcome}
                            </span>
                          </div>
                          <span className="text-[13px] font-medium text-[var(--color-text-primary)]">
                            {count}
                            <span className="ml-1 text-[11px] text-[var(--color-text-secondary)]">
                              ({pct}%)
                            </span>
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-[var(--color-bg-panel)] overflow-hidden">
                          <div
                            className={`h-full rounded-full ${dotColor} transition-all`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </Card>
          </div>

          {/* Agent performance */}
          {agg.agents.length > 0 && (
            <Card>
              <CardTitle className="mb-5">Agentprestationer</CardTitle>
              <div className="space-y-3">
                {agg.agents.map((agent) => (
                  <div
                    key={agent.name}
                    className="flex items-center justify-between rounded-[10px] border border-[var(--color-border)] px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-50 text-[13px] font-semibold text-indigo-700">
                        {agent.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <div>
                        <p className="text-[14px] font-medium text-[var(--color-text-primary)]">
                          {agent.name}
                        </p>
                        <p className="text-[12px] text-[var(--color-text-secondary)]">
                          {agent.calls} samtal
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Stars score={agent.avgScore} />
                      <span className="text-[15px] font-mono font-medium text-[var(--color-text-primary)] min-w-[3ch] text-right">
                        {agent.avgScore > 0 ? agent.avgScore.toFixed(1) : "—"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Insights: Needs, Objections, Signals */}
          <div className="grid grid-cols-3 gap-[var(--spacing-element)]">
            <Card>
              <h3 className="text-[11px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)] mb-3">
                Vanligaste kundbehov
              </h3>
              <TagCloud items={agg.customerNeeds} color="bg-blue-50 text-blue-700" />
            </Card>
            <Card>
              <h3 className="text-[11px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)] mb-3">
                Vanligaste invändningar
              </h3>
              <TagCloud items={agg.objections} color="bg-rose-50 text-rose-700" />
            </Card>
            <Card>
              <h3 className="text-[11px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)] mb-3">
                Positiva signaler
              </h3>
              <TagCloud items={agg.positiveSignals} color="bg-emerald-50 text-emerald-700" />
            </Card>
          </div>

          {/* AI Coaching */}
          {agg.coachingTips.length > 0 && (
            <Card className="border-indigo-100 bg-gradient-to-br from-white to-indigo-50/50">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100">
                  <Lightbulb className="h-4 w-4 text-indigo-600" />
                </div>
                <CardTitle className="text-indigo-900">
                  AI Coaching — Saker att tänka på imorgon
                </CardTitle>
              </div>
              <div className="space-y-3">
                {agg.coachingTips.map((tip, i) => (
                  <div
                    key={i}
                    className="flex gap-3 rounded-[10px] border border-indigo-100 bg-white/60 px-4 py-3"
                  >
                    <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" />
                    <p className="text-[13px] text-[var(--color-text-primary)] leading-relaxed">
                      {tip}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
