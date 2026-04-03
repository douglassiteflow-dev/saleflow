import { useState, useEffect, useRef } from "react";
import { joinCallsChannel } from "@/lib/socket";
import { Card, CardTitle } from "@/components/ui/card";
import type { LiveCall } from "@/api/types";

function CallTimer() {
  const [seconds, setSeconds] = useState(0);
  const ref = useRef<ReturnType<typeof setInterval>>(undefined);
  useEffect(() => {
    ref.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(ref.current);
  }, []);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return (
    <span className="font-mono text-sm text-[var(--color-accent)]">
      {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </span>
  );
}

export function LiveCalls() {
  const [calls, setCalls] = useState<LiveCall[]>([]);
  useEffect(() => {
    const channel = joinCallsChannel((newCalls) => { setCalls(newCalls as LiveCall[]); });
    return () => { channel?.leave(); };
  }, []);

  if (calls.length === 0) return null;

  return (
    <Card>
      <CardTitle>Pågående samtal</CardTitle>
      <div className="mt-3 space-y-2">
        {calls.map((call, i) => (
          <div key={`${call.extension}-${i}`} className="flex items-center justify-between py-2 border-b border-[var(--color-border)] last:border-0">
            <div className="flex items-center gap-3">
              <span className={`inline-block w-2 h-2 rounded-full ${call.linestatus === "up" ? "bg-[var(--color-success)]" : "bg-[var(--color-warning)] animate-pulse"}`} />
              <div>
                <p className="text-sm font-medium text-[var(--color-text-primary)]">{call.agent_name}</p>
                <p className="text-sm text-[var(--color-text-secondary)]">{call.direction === "out" ? "→" : "←"} {call.callerid}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <CallTimer />
              <a href="https://home.telavox.se/" target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--color-accent)] hover:underline">Medlyssna</a>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
