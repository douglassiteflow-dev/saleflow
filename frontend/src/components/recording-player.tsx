import { useRecordingUrl } from "@/api/telavox";
import { useState } from "react";

interface RecordingPlayerProps {
  phoneCallId: string;
}

export function RecordingPlayer({ phoneCallId }: RecordingPlayerProps) {
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading } = useRecordingUrl(expanded ? phoneCallId : null);

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="inline-flex items-center gap-1 text-[11px] text-[var(--color-accent)] hover:underline cursor-pointer"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
        Spela upp inspelning
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setExpanded(false)}
        className="inline-flex items-center gap-1 text-[11px] text-[var(--color-accent)] hover:underline cursor-pointer"
      >
        Dölj inspelning
      </button>
      {isLoading && (
        <span className="text-[11px] text-[var(--color-text-secondary)]">Laddar...</span>
      )}
      {!isLoading && data?.url && (
        <audio controls src={data.url} className="w-full" />
      )}
      {!isLoading && !data?.url && (
        <span className="text-[11px] text-[var(--color-text-secondary)]">Ingen inspelning</span>
      )}
    </div>
  );
}
