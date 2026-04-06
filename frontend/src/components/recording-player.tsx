import { useRecordingUrl } from "@/api/telavox";
import { useState } from "react";

interface RecordingPlayerProps {
  phoneCallId: string;
  onPlay?: (url: string) => void;
}

export function RecordingPlayer({ phoneCallId, onPlay }: RecordingPlayerProps) {
  const [requested, setRequested] = useState(false);
  const { data, isLoading } = useRecordingUrl(requested ? phoneCallId : null);

  // Once we have the URL, trigger the global player
  if (requested && data?.url && onPlay) {
    onPlay(data.url);
    setRequested(false);
  }

  if (isLoading && requested) {
    return <span className="text-[11px] text-[var(--color-text-secondary)]">Laddar...</span>;
  }

  return (
    <button
      type="button"
      onClick={() => {
        if (data?.url && onPlay) {
          onPlay(data.url);
        } else {
          setRequested(true);
        }
      }}
      className="inline-flex items-center gap-1 text-[11px] text-[var(--color-accent)] hover:underline cursor-pointer"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
        <polygon points="5 3 19 12 5 21 5 3" />
      </svg>
      Spela upp
    </button>
  );
}
