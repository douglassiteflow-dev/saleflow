import { useState } from "react";
import { X, ChevronDown, ChevronRight } from "lucide-react";
import type { Scorecard, TalkRatio, SentimentAnalysis } from "@/api/types";
import { ScoreBar } from "@/components/score-bar";

interface ScoreDetail {
  score: number;
  comment: string;
}

export interface Analysis {
  conversation: { speaker: string; text: string }[];
  summary: string;
  meeting_time: string | null;
  customer_needs: string[];
  objections: string[];
  positive_signals: string[];
  score: {
    opening: ScoreDetail;
    needs_discovery: ScoreDetail;
    pitch: ScoreDetail;
    objection_handling: ScoreDetail;
    closing: ScoreDetail;
    overall: number;
    top_feedback: string;
  };
  scorecard?: Scorecard;
  talk_ratio?: TalkRatio;
  sentiment?: SentimentAnalysis;
}

interface Props {
  analysis: Analysis;
  companyName?: string;
  onClose: () => void;
}

function Stars({ score, max = 10 }: { score: number; max?: number }) {
  const stars = Math.round((score / max) * 5);
  return (
    <span className="text-amber-400">
      {"★".repeat(stars)}
      {"☆".repeat(5 - stars)}
    </span>
  );
}


function Tag({ children, color }: { children: string; color: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${color}`}>
      {children}
    </span>
  );
}

function scorePct(score: number, max: number) {
  return (score / max) * 100;
}

function scoreColor(score: number) {
  if (score >= 8) return "bg-emerald-500";
  if (score >= 6) return "bg-amber-400";
  if (score >= 4) return "bg-orange-400";
  return "bg-red-500";
}

interface ScorecardCategoryRowProps {
  label: string;
  categoryKey: keyof Scorecard;
  scorecard: Scorecard;
}

function ScorecardCategoryRow({ label, categoryKey, scorecard }: ScorecardCategoryRowProps) {
  const [expanded, setExpanded] = useState(false);
  const category = scorecard[categoryKey] as Record<string, { score: number; comment: string } | number>;
  const avg = typeof category.avg === "number" ? category.avg : 0;
  const pct = scorePct(avg, 10);
  const color = scoreColor(avg);

  const questions = Object.entries(category).filter(
    ([key]) => key !== "avg",
  ) as [string, { score: number; comment: string }][];

  return (
    <div className="space-y-1">
      <button
        type="button"
        className="w-full flex items-center gap-2 group"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="text-[var(--color-text-secondary)] shrink-0">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </span>
        <span className="text-[13px] font-medium text-[var(--color-text-primary)] flex-1 text-left">
          {label}
        </span>
        <span className="text-[13px] font-mono text-[var(--color-text-secondary)]">
          {avg.toFixed(1)}/10
        </span>
      </button>
      <div className="ml-5 h-2 rounded-full bg-[var(--color-bg-panel)] overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>

      {expanded && questions.length > 0 && (
        <div className="ml-5 mt-2 space-y-3 border-l-2 border-[var(--color-border)] pl-3">
          {questions.map(([question, detail]) => {
            const qPct = scorePct(detail.score, 5);
            const qColor = scoreColor((detail.score / 5) * 10);
            return (
              <div key={question} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-[var(--color-text-primary)]">{question}</span>
                  <span className="text-[12px] font-mono text-[var(--color-text-secondary)]">
                    {detail.score}/5
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-[var(--color-bg-panel)] overflow-hidden">
                  <div
                    className={`h-full rounded-full ${qColor} transition-all`}
                    style={{ width: `${qPct}%` }}
                  />
                </div>
                {detail.comment && (
                  <p className="text-[11px] text-[var(--color-text-secondary)] italic leading-relaxed">
                    &ldquo;{detail.comment}&rdquo;
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TalkRatioSection({ talkRatio }: { talkRatio: TalkRatio }) {
  const sellerPct = Math.round(talkRatio.seller_pct);
  const customerPct = Math.round(talkRatio.customer_pct);
  const tooMuchTalk = talkRatio.seller_pct > 65;
  const longMonolog = talkRatio.longest_monolog_seconds > 60;

  return (
    <div className="space-y-3">
      <h3 className="text-[11px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)]">
        Talfördelning
      </h3>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[12px] text-[var(--color-text-secondary)]">
          <span>Säljare {sellerPct}%</span>
          <span>Kund {customerPct}%</span>
        </div>
        <div className="h-3 rounded-full overflow-hidden flex">
          <div
            data-testid="seller-bar"
            className="h-full bg-indigo-400 transition-all"
            style={{ width: `${sellerPct}%` }}
          />
          <div
            data-testid="customer-bar"
            className="h-full bg-emerald-400 flex-1 transition-all"
          />
        </div>
        <div className="flex items-center gap-3 text-[11px] text-[var(--color-text-secondary)]">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-indigo-400" />
            Säljare
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
            Kund
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-[12px] text-[var(--color-text-secondary)]">
        <span>
          Längsta monolog:{" "}
          <span className="font-medium text-[var(--color-text-primary)]">
            {talkRatio.longest_monolog_seconds}s
          </span>
        </span>
        <span>·</span>
        <span>
          Snitt säljare/tur:{" "}
          <span className="font-medium text-[var(--color-text-primary)]">
            {talkRatio.avg_seller_turn_seconds}s
          </span>
        </span>
        <span>·</span>
        <span>
          Snitt kund/tur:{" "}
          <span className="font-medium text-[var(--color-text-primary)]">
            {talkRatio.avg_customer_turn_seconds}s
          </span>
        </span>
      </div>

      {tooMuchTalk && (
        <div
          data-testid="warning-seller-talk"
          className="rounded-[8px] bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] text-amber-700"
        >
          Säljaren pratar för mycket ({sellerPct}%). Sikta på max 65%.
        </div>
      )}
      {longMonolog && (
        <div
          data-testid="warning-long-monolog"
          className="rounded-[8px] bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] text-amber-700"
        >
          Lång monolog på {talkRatio.longest_monolog_seconds}s. Försök hålla dem under 60s.
        </div>
      )}
    </div>
  );
}

function SentimentSection({ sentiment }: { sentiment: SentimentAnalysis }) {
  const emojiMap = {
    POSITIVE: "😊",
    NEUTRAL: "😐",
    NEGATIVE: "😟",
  };
  const labelMap = {
    POSITIVE: "Positiv",
    NEUTRAL: "Neutral",
    NEGATIVE: "Negativ",
  };
  const colorMap = {
    POSITIVE: "text-emerald-600",
    NEUTRAL: "text-amber-600",
    NEGATIVE: "text-rose-600",
  };

  const emoji = emojiMap[sentiment.overall];
  const label = labelMap[sentiment.overall];
  const color = colorMap[sentiment.overall];

  return (
    <div className="space-y-3">
      <h3 className="text-[11px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)]">
        Sentiment
      </h3>
      <div className="flex items-center gap-2">
        <span className="text-[20px]" role="img" aria-label={label}>
          {emoji}
        </span>
        <span className={`text-[15px] font-medium ${color}`}>{label}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-[12px]">
        <div className="rounded-[8px] bg-emerald-50 border border-emerald-100 py-1.5">
          <div className="font-medium text-emerald-700">
            {Math.round(sentiment.positive_pct)}%
          </div>
          <div className="text-[11px] text-emerald-600">Positiv</div>
        </div>
        <div className="rounded-[8px] bg-zinc-50 border border-zinc-200 py-1.5">
          <div className="font-medium text-zinc-600">
            {Math.round(sentiment.neutral_pct)}%
          </div>
          <div className="text-[11px] text-zinc-500">Neutral</div>
        </div>
        <div className="rounded-[8px] bg-rose-50 border border-rose-100 py-1.5">
          <div className="font-medium text-rose-700">
            {Math.round(sentiment.negative_pct)}%
          </div>
          <div className="text-[11px] text-rose-600">Negativ</div>
        </div>
      </div>
    </div>
  );
}

const SCORECARD_LABELS: Record<keyof Omit<Scorecard, "overall_avg">, string> = {
  opening: "Öppning",
  discovery: "Behovsanalys",
  pitch: "Pitch",
  objection_handling: "Invändningshantering",
  closing: "Avslut",
};

export function CallAnalysisModal({ analysis, companyName, onClose }: Props) {
  const hasScorecard = !!analysis.scorecard;
  const overall = hasScorecard
    ? analysis.scorecard!.overall_avg
    : analysis.score.overall;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] rounded-[14px] bg-white shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <div>
            <h2 className="text-[18px] font-medium text-[var(--color-text-primary)]">
              Samtalsanalys{companyName ? ` — ${companyName}` : ""}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <Stars score={overall} />
              <span className="text-[13px] text-[var(--color-text-secondary)]">{overall}/10 totalt</span>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-[var(--color-bg-panel)] transition-colors">
            <X className="h-5 w-5 text-[var(--color-text-secondary)]" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Summary */}
          <div>
            <h3 className="text-[11px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)] mb-2">
              Sammanfattning
            </h3>
            <p className="text-[14px] text-[var(--color-text-primary)] leading-relaxed">
              {analysis.summary}
            </p>
          </div>

          {/* Key info */}
          <div className="grid grid-cols-2 gap-4">
            {analysis.meeting_time && (
              <div className="rounded-[10px] border border-[var(--color-border)] p-3">
                <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)] mb-1">Mötestid</p>
                <p className="text-[14px] font-medium text-[var(--color-text-primary)]">{analysis.meeting_time}</p>
              </div>
            )}
            {analysis.customer_needs.length > 0 && (
              <div className="rounded-[10px] border border-[var(--color-border)] p-3">
                <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)] mb-1">Kundbehov</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {analysis.customer_needs.map((n) => (
                    <Tag key={n} color="bg-blue-50 text-blue-700">{n}</Tag>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Signals */}
          <div className="flex flex-wrap gap-4">
            {analysis.positive_signals?.length > 0 && (
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-emerald-600 mb-1.5">Positiva signaler</p>
                <div className="flex flex-wrap gap-1">
                  {analysis.positive_signals.map((s) => (
                    <Tag key={s} color="bg-emerald-50 text-emerald-700">{s}</Tag>
                  ))}
                </div>
              </div>
            )}
            {analysis.objections?.length > 0 && (
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-rose-600 mb-1.5">Invändningar</p>
                <div className="flex flex-wrap gap-1">
                  {analysis.objections.map((o) => (
                    <Tag key={o} color="bg-rose-50 text-rose-700">{o}</Tag>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Scores — 25-point scorecard or legacy 5-point */}
          {hasScorecard ? (
            <div>
              <h3 className="text-[11px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)] mb-3">
                Betyg (25p)
              </h3>
              <div className="space-y-4">
                {(Object.keys(SCORECARD_LABELS) as Array<keyof Omit<Scorecard, "overall_avg">>).map((key) => (
                  <ScorecardCategoryRow
                    key={key}
                    label={SCORECARD_LABELS[key]}
                    categoryKey={key}
                    scorecard={analysis.scorecard!}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div>
              <h3 className="text-[11px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)] mb-3">
                Betyg
              </h3>
              <div className="space-y-4">
                <ScoreBar label="Öppning" score={analysis.score.opening.score} comment={analysis.score.opening.comment} />
                <ScoreBar label="Behovsanalys" score={analysis.score.needs_discovery.score} comment={analysis.score.needs_discovery.comment} />
                <ScoreBar label="Pitch" score={analysis.score.pitch.score} comment={analysis.score.pitch.comment} />
                <ScoreBar label="Invändningshantering" score={analysis.score.objection_handling.score} comment={analysis.score.objection_handling.comment} />
                <ScoreBar label="Avslut" score={analysis.score.closing.score} comment={analysis.score.closing.comment} />
              </div>
            </div>
          )}

          {/* Talk ratio */}
          {analysis.talk_ratio && (
            <TalkRatioSection talkRatio={analysis.talk_ratio} />
          )}

          {/* Sentiment */}
          {analysis.sentiment && (
            <SentimentSection sentiment={analysis.sentiment} />
          )}

          {/* Coaching */}
          <div className="rounded-[10px] bg-indigo-50 border border-indigo-100 p-4">
            <h3 className="text-[11px] font-medium uppercase tracking-[0.5px] text-indigo-600 mb-2">
              Coaching
            </h3>
            <p className="text-[13px] text-[var(--color-text-primary)] leading-relaxed">
              {analysis.score.top_feedback}
            </p>
          </div>

          {/* Conversation */}
          <div>
            <h3 className="text-[11px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)] mb-3">
              Konversation
            </h3>
            <div className="space-y-2">
              {analysis.conversation.map((msg, i) => {
                const isAgent = msg.speaker === "Säljare";
                return (
                  <div key={i} className={`flex ${isAgent ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-[12px] px-3.5 py-2 ${
                      isAgent
                        ? "bg-indigo-500 text-white"
                        : "bg-[var(--color-bg-panel)] text-[var(--color-text-primary)]"
                    }`}>
                      <p className={`text-[10px] font-medium mb-0.5 ${isAgent ? "text-indigo-200" : "text-[var(--color-text-secondary)]"}`}>
                        {msg.speaker}
                      </p>
                      <p className="text-[13px] leading-relaxed">{msg.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ScoreStars({ score, onClick }: { score: number; onClick?: () => void }) {
  const stars = Math.round((score / 10) * 5);

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      className="text-[13px] text-amber-400 hover:text-amber-500 cursor-pointer transition-colors"
      title={`${score}/10 — Klicka för analys`}
    >
      {"★".repeat(stars)}{"☆".repeat(5 - stars)}
    </button>
  );
}
