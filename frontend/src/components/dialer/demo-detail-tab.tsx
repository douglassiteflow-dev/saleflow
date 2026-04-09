import { useState, useEffect, useRef } from "react";
import { useDemoConfigDetail, useRetryDemoConfig, useMarkDemoHeld } from "@/api/demo-configs";
import { DemoStageIndicator } from "./demo-stage-indicator";
import { BookFollowupModal } from "./book-followup-modal";
import { InfoRow } from "@/components/ui/info-row";
import { formatPhone, formatDate, formatTime } from "@/lib/format";
import Loader from "@/components/kokonutui/loader";
import type { DemoConfigDetail } from "@/api/types";

interface DemoDetailTabProps {
  demoConfigId: string;
  onBack: () => void;
}

export function DemoDetailTab({ demoConfigId, onBack }: DemoDetailTabProps) {
  const { data, isLoading } = useDemoConfigDetail(demoConfigId);
  const retry = useRetryDemoConfig();
  const markHeld = useMarkDemoHeld();
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
            onRetry={() => retry.mutate(demoConfigId)}
            isRetrying={retry.isPending}
            onMarkHeld={() => markHeld.mutate(demoConfigId)}
            isMarkingHeld={markHeld.isPending}
          />
        )}
        {data.stage === "demo_held" && (
          <DemoHeldContent
            demoConfigId={demoConfigId}
            leadName={companyName}
            leadEmail={data.lead.epost}
            previewUrl={data.preview_url}
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
  onRetry,
  isRetrying,
  onMarkHeld,
  isMarkingHeld,
}: {
  previewUrl: string | null;
  onRetry: () => void;
  isRetrying: boolean;
  onMarkHeld: () => void;
  isMarkingHeld: boolean;
}) {
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-[var(--color-text-primary)]">
        Hemsidan är klar att visa under demo-mötet. Klicka nedan när mötet är genomfört.
      </p>

      {previewUrl && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-emerald-700 mb-1.5">
            Deras demo-hemsida
          </p>
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[13px] font-medium text-emerald-800 hover:underline break-all"
          >
            {previewUrl}
          </a>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMarkHeld}
          disabled={isMarkingHeld}
          className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {isMarkingHeld ? "Markerar..." : "Markera demo-mötet som genomfört →"}
        </button>
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

/* ── Stage: demo_held ── */

function DemoHeldContent({
  demoConfigId,
  leadName,
  leadEmail,
  previewUrl,
}: {
  demoConfigId: string;
  leadName: string;
  leadEmail: string | null;
  previewUrl: string | null;
}) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-[var(--color-text-primary)]">
        Demo-mötet är genomfört. Dags att boka uppföljning med kunden och skicka frågeformuläret.
      </p>

      {previewUrl && (
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)] mb-1.5">
            Deras hemsida
          </p>
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[13px] text-[var(--color-accent)] hover:underline break-all"
          >
            {previewUrl}
          </a>
        </div>
      )}

      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-white hover:opacity-90 transition-opacity"
      >
        Boka uppföljning →
      </button>

      <BookFollowupModal
        demoConfigId={demoConfigId}
        leadName={leadName}
        leadEmail={leadEmail}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}

/* ── Stage: followup ── */

function FollowupContent({ data }: { data: DemoConfigDetail }) {
  const q = data.questionnaire;
  const followupMeeting = data.meetings.find((m) => m.title?.startsWith("Uppföljning") || m.title?.startsWith("Follow-up"));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Left: tracking + links */}
      <div className="space-y-5">
        {/* Tracking */}
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)] mb-3">
            Kundstatus
          </p>
          <div className="space-y-2">
            <TrackingRow icon="✉️" label="Mail skickat" value={formatTimestamp(q?.inserted_at)} />
            <TrackingRow icon="👁" label="Frågeformulär öppnat" value={formatTimestamp(q?.opened_at)} />
            <TrackingRow icon="✏️" label="Formulär påbörjat" value={formatTimestamp(q?.started_at)} />
            <TrackingRow icon="✅" label="Formulär ifyllt" value={formatTimestamp(q?.completed_at)} />
          </div>
        </div>

        {/* Preview link */}
        {data.preview_url && (
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)] mb-1.5">
              Hemsida
            </p>
            <a
              href={data.preview_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] text-[var(--color-accent)] hover:underline break-all"
            >
              {data.preview_url}
            </a>
          </div>
        )}

        {/* Questionnaire link */}
        {q && (
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)] mb-1.5">
              Frågeformulär
            </p>
            <a
              href={`/q/${q.token}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] text-[var(--color-accent)] hover:underline"
            >
              Öppna formulär →
            </a>
          </div>
        )}
      </div>

      {/* Right: meeting info + lead info */}
      <div className="space-y-5">
        {followupMeeting && (
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)] mb-1.5">
              Uppföljningsmöte
            </p>
            <p className="text-[13px] text-[var(--color-text-primary)]">
              {formatDate(followupMeeting.meeting_date)} kl {formatTime(followupMeeting.meeting_time)}
            </p>
            {followupMeeting.teams_join_url && (
              <a
                href={followupMeeting.teams_join_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[13px] text-[var(--color-accent)] hover:underline"
              >
                Anslut till Teams-mötet →
              </a>
            )}
          </div>
        )}

        <div>
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
    </div>
  );
}

function TrackingRow({ icon, label, value }: { icon: string; label: string; value: string | null }) {
  return (
    <div className="flex items-center gap-3 text-[13px]" data-testid="tracking-row">
      <span className="text-base" aria-hidden="true">{icon}</span>
      <span className="text-[var(--color-text-secondary)] w-40">{label}:</span>
      <span
        data-testid="tracking-value"
        data-empty={value ? "false" : "true"}
        className={value ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-secondary)]"}
      >
        {value || "—"}
      </span>
    </div>
  );
}

function formatTimestamp(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleString("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

