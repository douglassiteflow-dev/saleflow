/**
 * Shared ScoreBar component used by daily-summary and call-analysis-modal.
 *
 * - Without `comment`: renders label + numeric score + bar (daily-summary style).
 * - With `comment`: adds a quoted italic comment below the bar (call-analysis-modal style).
 */

interface ScoreBarProps {
  label: string;
  score: number;
  max?: number;
  comment?: string;
}

export function ScoreBar({ label, score, max = 10, comment }: ScoreBarProps) {
  const pct = (score / max) * 100;
  const color =
    score >= 8
      ? "bg-emerald-500"
      : score >= 6
        ? "bg-amber-400"
        : score >= 4
          ? "bg-orange-400"
          : "bg-red-500";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-[var(--color-text-primary)]">{label}</span>
        <span className="text-[13px] font-mono text-[var(--color-text-secondary)]">
          {score.toFixed(1)}/10
        </span>
      </div>
      <div className="h-2 rounded-full bg-[var(--color-bg-panel)] overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {comment && (
        <p className="text-[12px] text-[var(--color-text-secondary)] leading-relaxed italic">
          &ldquo;{comment}&rdquo;
        </p>
      )}
    </div>
  );
}
