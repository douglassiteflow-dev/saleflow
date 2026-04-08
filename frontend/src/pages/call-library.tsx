import { useState, useEffect, useRef } from "react";
import { useCallSearch } from "@/api/call-search";
import { formatDuration, formatDateTime } from "@/lib/format";
import { OUTCOME_LABELS, OUTCOME_COLORS } from "@/lib/constants";
import Loader from "@/components/kokonutui/loader";
import type { CallSearchResult } from "@/api/types";

const OUTCOME_OPTIONS = [
  { value: "", label: "Alla utfall" },
  { value: "meeting_booked", label: "Möte bokat" },
  { value: "callback", label: "Återuppringning" },
  { value: "not_interested", label: "Ej intresserad" },
  { value: "no_answer", label: "Ej svar" },
  { value: "call_later", label: "Ring senare" },
  { value: "bad_number", label: "Fel nummer" },
  { value: "customer", label: "Kund" },
];

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function CallResultCard({ result }: { result: CallSearchResult }) {
  return (
    <div className="rounded-[14px] bg-[var(--color-bg-primary)] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-start justify-between gap-4">
        {/* Left: snippet + meta */}
        <div className="min-w-0 flex-1 space-y-2">
          {/* Snippet with highlighted text */}
          <p
            className="text-[13px] leading-relaxed text-[var(--color-text-primary)] [&_mark]:rounded [&_mark]:bg-amber-200 [&_mark]:px-0.5 [&_mark]:text-amber-900"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: server-provided snippet with <mark> highlights
            dangerouslySetInnerHTML={{ __html: result.snippet }}
          />

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-3 text-[12px] text-[var(--color-text-secondary)]">
            {result.agent_name && (
              <span className="font-medium text-[var(--color-accent)]">
                {result.agent_name}
              </span>
            )}
            <span>{formatDateTime(result.received_at)}</span>
            <span>{formatDuration(result.duration)}</span>

            {result.outcome && (
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${OUTCOME_COLORS[result.outcome] ?? "bg-slate-100 text-slate-600"}`}
              >
                {OUTCOME_LABELS[result.outcome] ?? result.outcome}
              </span>
            )}

            {result.scorecard_avg !== null && (
              <span className="text-[var(--color-text-secondary)]">
                Betyg:{" "}
                <span className="font-medium text-[var(--color-text-primary)]">
                  {result.scorecard_avg.toFixed(1)}
                </span>
              </span>
            )}

            {result.sentiment && (
              <span className="text-[var(--color-text-secondary)]">
                {result.sentiment}
              </span>
            )}
          </div>

          {/* Summary */}
          {result.summary && (
            <p className="text-[12px] italic text-[var(--color-text-secondary)]">
              {result.summary}
            </p>
          )}
        </div>

        {/* Right: play button */}
        <a
          href={`/api/calls/${result.id}/recording`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Spela upp inspelning"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-white transition-opacity hover:opacity-80"
        >
          {/* Play icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-4 w-4"
          >
            <path d="M8 5.14v14l11-7-11-7z" />
          </svg>
        </a>
      </div>
    </div>
  );
}

export function CallLibraryPage() {
  const [rawQuery, setRawQuery] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState("");
  const [minScore, setMinScore] = useState("");

  const debouncedQuery = useDebounce(rawQuery, 300);

  const filters: Record<string, string> = {};
  if (agentFilter) filters.agent = agentFilter;
  if (dateFrom) filters.from = dateFrom;
  if (dateTo) filters.to = dateTo;
  if (outcomeFilter) filters.outcome = outcomeFilter;
  if (minScore) filters.min_score = minScore;

  const { data: results, isLoading } = useCallSearch(debouncedQuery, filters);

  const inputRef = useRef<HTMLInputElement>(null);

  const hasQuery = debouncedQuery.length >= 2;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-[22px] font-light tracking-[-0.5px] text-[var(--color-text-primary)]">
          Samtalsbibliotek
        </h1>
        <p className="mt-0.5 text-[13px] text-[var(--color-text-secondary)]">
          Sök och filtrera bland inspelade samtal
        </p>
      </div>

      {/* Search input */}
      <div className="relative">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-secondary)]"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          ref={inputRef}
          type="search"
          value={rawQuery}
          onChange={(e) => setRawQuery(e.target.value)}
          placeholder="Sök i transkript, sammanfattning..."
          aria-label="Sök samtal"
          className="h-10 w-full rounded-[10px] border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] pl-9 pr-4 text-[13px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
        />
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Agent */}
        <input
          type="text"
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          placeholder="Agent"
          aria-label="Filtrera på agent"
          className="h-9 w-40 rounded-[10px] border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-3 text-[13px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
        />

        {/* Date from */}
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          aria-label="Datum från"
          className="h-9 rounded-[10px] border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-3 text-[13px] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
        />

        <span className="text-sm text-[var(--color-text-secondary)]">&ndash;</span>

        {/* Date to */}
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          aria-label="Datum till"
          className="h-9 rounded-[10px] border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-3 text-[13px] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
        />

        {/* Outcome */}
        <select
          value={outcomeFilter}
          onChange={(e) => setOutcomeFilter(e.target.value)}
          aria-label="Filtrera på utfall"
          className="h-9 rounded-[10px] border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-3 text-[13px] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
        >
          {OUTCOME_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {/* Min score */}
        <input
          type="number"
          value={minScore}
          onChange={(e) => setMinScore(e.target.value)}
          placeholder="Min. betyg"
          aria-label="Minsta betyg"
          min={0}
          max={10}
          step={0.1}
          className="h-9 w-28 rounded-[10px] border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-3 text-[13px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
        />
      </div>

      {/* Results area */}
      {!hasQuery ? (
        <div className="rounded-[14px] bg-[var(--color-bg-primary)] p-[var(--spacing-card)] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <p className="text-[13px] text-[var(--color-text-secondary)]">
            Sök i samtalshistorik — skriv minst 2 tecken
          </p>
        </div>
      ) : isLoading ? (
        <div className="rounded-[14px] bg-[var(--color-bg-primary)] p-[var(--spacing-card)] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <Loader size="sm" title="Söker samtal..." />
        </div>
      ) : !results || results.length === 0 ? (
        <div className="rounded-[14px] bg-[var(--color-bg-primary)] p-[var(--spacing-card)] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <p className="text-[13px] text-[var(--color-text-secondary)]">
            Inga samtal hittades för &ldquo;{debouncedQuery}&rdquo;.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[12px] text-[var(--color-text-secondary)]">
            {results.length} {results.length === 1 ? "träff" : "träffar"}
          </p>
          {results.map((result) => (
            <CallResultCard key={result.id} result={result} />
          ))}
        </div>
      )}
    </div>
  );
}
