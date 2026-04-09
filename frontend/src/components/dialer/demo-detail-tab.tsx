import { useState, useEffect, useRef } from "react";
import { useDemoConfigDetail, useAdvanceDemoConfig, useRetryDemoConfig } from "@/api/demo-configs";
import { DemoStageIndicator } from "./demo-stage-indicator";
import { SendInviteButton } from "@/components/send-invite-button";
import { InfoRow } from "@/components/ui/info-row";
import { formatPhone, formatDate, formatTime } from "@/lib/format";
import Loader from "@/components/kokonutui/loader";

interface DemoDetailTabProps {
  demoConfigId: string;
  onBack: () => void;
}

export function DemoDetailTab({ demoConfigId, onBack }: DemoDetailTabProps) {
  const { data, isLoading } = useDemoConfigDetail(demoConfigId);
  const advance = useAdvanceDemoConfig();
  const retry = useRetryDemoConfig();
  const [logs, setLogs] = useState<string[]>([]);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // SSE log streaming for generating stage
  useEffect(() => {
    if (data?.stage !== "generating") return;

    const es = new EventSource(`/api/demo-configs/${demoConfigId}/logs`);
    es.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type === "log") setLogs((prev) => [...prev, payload.text]);
    };
    return () => es.close();
  }, [demoConfigId, data?.stage]);

  // Auto-scroll log container on new lines
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  if (isLoading || !data) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader size="sm" title="Laddar demo..." />
      </div>
    );
  }

  const companyName = data.lead_name ?? data.lead.företag;

  return (
    <div className="flex-1 overflow-auto">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-[var(--color-border)]">
        <button
          type="button"
          onClick={onBack}
          className="text-[13px] text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] transition-colors cursor-pointer"
        >
          ← Tillbaka
        </button>
        <span className="text-[var(--color-border)]">|</span>
        <span className="text-[13px] font-medium text-[var(--color-text-primary)]">{companyName}</span>
      </div>

      {/* Stage indicator */}
      <div className="px-5 py-4 border-b border-[var(--color-border)]">
        <DemoStageIndicator stage={data.stage} />
      </div>

      {/* Stage-specific content */}
      <div className="p-5">
        {data.stage === "meeting_booked" && <MeetingBookedContent sourceUrl={data.source_url} />}
        {data.stage === "generating" && <GeneratingContent logs={logs} logContainerRef={logContainerRef} />}
        {data.stage === "demo_ready" && (
          <DemoReadyContent
            previewUrl={data.preview_url}
            onAdvance={() => advance.mutate(demoConfigId)}
            onRetry={() => retry.mutate(demoConfigId)}
            isAdvancing={advance.isPending}
            isRetrying={retry.isPending}
          />
        )}
        {data.stage === "followup" && <FollowupContent data={data} />}
      </div>
    </div>
  );
}

/* ── Stage: meeting_booked ── */

function MeetingBookedContent({ sourceUrl }: { sourceUrl: string | null }) {
  if (!sourceUrl) {
    return (
      <p className="text-[13px] text-[var(--color-text-secondary)]">
        Ingen länk angiven — demo genereras inte
      </p>
    );
  }
  return (
    <p className="text-[13px] text-[var(--color-text-secondary)]">
      Väntar på att genereringen ska starta...
    </p>
  );
}

/* ── Stage: generating ── */

function GeneratingContent({
  logs,
  logContainerRef,
}: {
  logs: string[];
  logContainerRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div>
      <p className="text-[13px] text-[var(--color-text-primary)] mb-3">
        Genererar hemsida... Uppskattad tid: ~6–10 min
      </p>
      <div
        ref={logContainerRef}
        data-testid="log-container"
        className="h-64 overflow-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-panel)] p-3 font-mono text-[11px] text-[var(--color-text-secondary)]"
      >
        {logs.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </div>
  );
}

/* ── Stage: demo_ready ── */

function DemoReadyContent({
  previewUrl,
  onAdvance,
  onRetry,
  isAdvancing,
  isRetrying,
}: {
  previewUrl: string | null;
  onAdvance: () => void;
  onRetry: () => void;
  isAdvancing: boolean;
  isRetrying: boolean;
}) {
  return (
    <div>
      {previewUrl && (
        <iframe
          src={previewUrl}
          title="Demo preview"
          className="w-full h-80 rounded-lg border border-[var(--color-border)] mb-4"
        />
      )}
      <div className="flex items-center gap-3">
        {previewUrl && (
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-[var(--color-border)] bg-white px-3 py-1.5 text-[13px] font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-bg-panel)] transition-colors"
          >
            Öppna i ny flik
          </a>
        )}
        <button
          type="button"
          onClick={onAdvance}
          disabled={isAdvancing}
          className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[13px] font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {isAdvancing ? "Avancerar..." : "Gå till uppföljning →"}
        </button>
        <button
          type="button"
          onClick={onRetry}
          disabled={isRetrying}
          className="rounded-md border border-orange-300 bg-orange-50 px-3 py-1.5 text-[13px] font-medium text-orange-700 hover:bg-orange-100 transition-colors disabled:opacity-50"
        >
          {isRetrying ? "Genererar om..." : "Generera om"}
        </button>
      </div>
    </div>
  );
}

/* ── Stage: followup ── */

function FollowupContent({ data }: { data: NonNullable<ReturnType<typeof useDemoConfigDetail>["data"]> }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
      {/* Left: Demo link + Meetings */}
      <div className="pr-5 border-r border-[var(--color-border)]">
        {data.preview_url && (
          <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-emerald-700 mb-1.5">
              Demo-länk
            </p>
            <a
              href={data.preview_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] font-medium text-emerald-800 hover:underline truncate block"
            >
              {data.preview_url}
            </a>
          </div>
        )}

        <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)] mb-3">
          Möten
        </p>
        {data.meetings.length === 0 ? (
          <p className="text-xs text-[var(--color-text-secondary)]">Inga möten.</p>
        ) : (
          <div className="space-y-2">
            {data.meetings.map((m) => (
              <div key={m.id} className="bg-[var(--color-bg-panel)] rounded-md p-2.5 text-xs">
                <div className="flex justify-between mb-1">
                  <span className="font-medium text-[var(--color-text-primary)]">{m.title}</span>
                  <span className="text-[10px] text-[var(--color-text-secondary)]">{m.status}</span>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-[var(--color-text-secondary)]">
                    {formatDate(m.meeting_date)} {formatTime(m.meeting_time)}
                  </p>
                  <SendInviteButton
                    meetingId={m.id}
                    teamsJoinUrl={m.teams_join_url}
                    attendeeEmail={m.attendee_email}
                    attendeeName={m.attendee_name}
                    leadEmail={data.lead?.epost}
                    leadName={data.lead?.företag}
                    meetingDate={m.meeting_date}
                    meetingTime={m.meeting_time}
                    size="sm"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right: Lead info */}
      <div className="pl-5">
        <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)] mb-3">
          Kundinfo
        </p>
        <div className="space-y-0">
          <InfoRow label="Företag" value={data.lead.företag} bold />
          {data.lead.telefon && <InfoRow label="Telefon" value={formatPhone(data.lead.telefon)} mono />}
          {data.lead.epost && <InfoRow label="E-post" value={data.lead.epost} />}
        </div>
      </div>
    </div>
  );
}

