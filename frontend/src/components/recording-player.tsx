import { useState, useRef, useEffect } from "react";
import { useRecordingUrl } from "@/api/telavox";

interface RecordingPlayerProps {
  phoneCallId: string;
}

export function RecordingPlayer({ phoneCallId }: RecordingPlayerProps) {
  const [playing, setPlaying] = useState(false);
  const { data, isLoading } = useRecordingUrl(playing ? phoneCallId : null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Auto-play when URL loads
  useEffect(() => {
    if (data?.url && audioRef.current) {
      audioRef.current.play().catch(() => {});
    }
  }, [data?.url]);

  if (!playing) {
    return (
      <button
        type="button"
        onClick={() => setPlaying(true)}
        className="inline-flex items-center gap-1 text-[11px] text-[var(--color-accent)] hover:underline cursor-pointer"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
        Spela upp
      </button>
    );
  }

  if (isLoading) {
    return <span className="text-[11px] text-[var(--color-text-secondary)]">Laddar...</span>;
  }

  if (!data?.url) {
    return <span className="text-[11px] text-[var(--color-text-secondary)]">Ingen inspelning</span>;
  }

  return (
    <audio
      ref={audioRef}
      controls
      src={data.url}
      onEnded={() => setPlaying(false)}
      className="h-7 w-44 rounded"
      style={{ background: "var(--color-bg-panel)" }}
    />
  );
}
