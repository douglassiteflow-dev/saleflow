import { useState, useRef, useEffect, useCallback } from "react";
import { X, Play, Pause } from "lucide-react";

interface AudioPlayerBarProps {
  url: string;
  title?: string;
  onClose: () => void;
}

export function AudioPlayerBar({ url, title, onClose }: AudioPlayerBarProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.play().catch(() => {});

    const onTime = () => setCurrentTime(audio.currentTime);
    const onMeta = () => setDuration(audio.duration);
    const onEnd = () => { setPlaying(false); };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnd);
      audio.pause();
    };
  }, [url]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); } else { audio.play().catch(() => {}); }
    setPlaying(!playing);
  }, [playing]);

  const seek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audio.currentTime = pct * duration;
  }, [duration]);

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-3 px-5 py-2" style={{ background: "rgba(224, 231, 255, 0.85)", backdropFilter: "blur(12px)", borderTop: "1px solid rgba(199, 210, 254, 0.5)" }}>
      <audio ref={audioRef} src={url} />

      <button
        type="button"
        onClick={toggle}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white hover:bg-indigo-700 transition-colors cursor-pointer"
      >
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ml-0.5" />}
      </button>

      <span className="text-[11px] text-indigo-400 shrink-0 w-8 text-right font-mono">
        {fmt(currentTime)}
      </span>

      <div
        className="flex-1 h-1.5 rounded-full bg-indigo-200 cursor-pointer relative"
        onClick={seek}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-indigo-600 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <span className="text-[11px] text-indigo-400 shrink-0 w-8 font-mono">
        {fmt(duration)}
      </span>

      {title && (
        <span className="text-[11px] text-indigo-700 truncate max-w-[150px]">{title}</span>
      )}

      <button
        type="button"
        onClick={onClose}
        className="shrink-0 rounded-full p-1 hover:bg-indigo-200 transition-colors cursor-pointer"
      >
        <X className="h-3.5 w-3.5 text-indigo-400" />
      </button>
    </div>
  );
}
