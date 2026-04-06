import { X } from "lucide-react";

interface ScoreDetail {
  score: number;
  comment: string;
}

interface Analysis {
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

function ScoreBar({ label, detail }: { label: string; detail: ScoreDetail }) {
  const pct = (detail.score / 10) * 100;
  const color =
    detail.score >= 8 ? "bg-emerald-500" :
    detail.score >= 6 ? "bg-amber-400" :
    detail.score >= 4 ? "bg-orange-400" : "bg-red-500";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-[var(--color-text-primary)]">{label}</span>
        <span className="text-[13px] font-mono text-[var(--color-text-secondary)]">{detail.score}/10</span>
      </div>
      <div className="h-2 rounded-full bg-[var(--color-bg-panel)] overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[12px] text-[var(--color-text-secondary)] leading-relaxed italic">
        &ldquo;{detail.comment}&rdquo;
      </p>
    </div>
  );
}

function Tag({ children, color }: { children: string; color: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${color}`}>
      {children}
    </span>
  );
}

export function CallAnalysisModal({ analysis, companyName, onClose }: Props) {
  const overall = analysis.score.overall;

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

          {/* Scores */}
          <div>
            <h3 className="text-[11px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)] mb-3">
              Betyg
            </h3>
            <div className="space-y-4">
              <ScoreBar label="Öppning" detail={analysis.score.opening} />
              <ScoreBar label="Behovsanalys" detail={analysis.score.needs_discovery} />
              <ScoreBar label="Pitch" detail={analysis.score.pitch} />
              <ScoreBar label="Invändningshantering" detail={analysis.score.objection_handling} />
              <ScoreBar label="Avslut" detail={analysis.score.closing} />
            </div>
          </div>

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
