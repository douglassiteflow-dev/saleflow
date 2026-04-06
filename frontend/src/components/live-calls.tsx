import { useState, useEffect, useRef } from "react";
import { joinCallsChannel } from "@/lib/socket";
import { Card, CardTitle } from "@/components/ui/card";

interface ActiveCall {
  user_id: string;
  agent_name: string;
  lead_name: string;
  phone: string;
  started_at: number;
}

function CallTimer({ startedAt }: { startedAt: number }) {
  const [seconds, setSeconds] = useState(() => Math.max(0, Math.floor(Date.now() / 1000) - startedAt));
  const ref = useRef<ReturnType<typeof setInterval>>(undefined);
  useEffect(() => {
    ref.current = setInterval(() => setSeconds(Math.max(0, Math.floor(Date.now() / 1000) - startedAt)), 1000);
    return () => clearInterval(ref.current);
  }, [startedAt]);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return (
    <span className="font-mono text-sm text-[var(--color-accent)]">
      {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </span>
  );
}

export function LiveCalls() {
  const [calls, setCalls] = useState<ActiveCall[]>([]);
  useEffect(() => {
    const channel = joinCallsChannel((newCalls) => { setCalls(newCalls as ActiveCall[]); });
    return () => { channel?.leave(); };
  }, []);

  if (calls.length === 0) return null;

  return (
    <Card>
      <CardTitle>Pågående samtal ({calls.length})</CardTitle>
      <div className="mt-3 space-y-2">
        {calls.map((call) => (
          <div key={call.user_id} className="flex items-center justify-between py-2 border-b border-[var(--color-border)] last:border-0">
            <div className="flex items-center gap-3">
              <span className="inline-block w-2 h-2 rounded-full bg-[var(--color-success)] animate-pulse" />
              <div>
                <p className="text-sm font-medium text-[var(--color-text-primary)]">{call.agent_name}</p>
                <p className="text-sm text-[var(--color-text-secondary)]">→ {call.lead_name} ({call.phone})</p>
              </div>
            </div>
            <CallTimer startedAt={call.started_at} />
          </div>
        ))}
      </div>
    </Card>
  );
}
