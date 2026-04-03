import { useState } from "react";
import { useRecordingUrl } from "@/api/telavox";

interface RecordingPlayerProps {
  phoneCallId: string;
}

export function RecordingPlayer({ phoneCallId }: RecordingPlayerProps) {
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading } = useRecordingUrl(expanded ? phoneCallId : null);

  return (
    <div>
      <button type="button" onClick={() => setExpanded(!expanded)} className="text-xs text-[var(--color-accent)] hover:underline">
        {expanded ? "Dölj inspelning" : "Spela upp inspelning"}
      </button>
      {expanded && (
        <div className="mt-2">
          {isLoading ? (
            <span className="text-xs text-[var(--color-text-secondary)]">Laddar...</span>
          ) : data?.url ? (
            <audio controls src={data.url} className="w-full h-8 rounded-[6px]" style={{ background: "var(--color-bg-panel)" }} />
          ) : (
            <span className="text-xs text-[var(--color-text-secondary)]">Ingen inspelning</span>
          )}
        </div>
      )}
    </div>
  );
}
