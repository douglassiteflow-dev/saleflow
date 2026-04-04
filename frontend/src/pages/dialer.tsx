import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { DialerTabs } from "@/components/dialer/dialer-tabs";
import { MiniLeaderboard } from "@/components/dialer/mini-leaderboard";
import { ActionBar } from "@/components/dialer/action-bar";
import { LeadComments } from "@/components/dialer/lead-comments";
import { OutcomeInline } from "@/components/dialer/outcome-inline";
import { useLeaderboard } from "@/api/dashboard";
import {
  useNextLead,
  useLeadDetail,
  useSubmitOutcome,
  useCallbacks,
} from "@/api/leads";
import { useCallHistory } from "@/api/calls";
import { useMeetings, useCancelMeeting } from "@/api/meetings";
import { useMe } from "@/api/auth";
import { useDial, useTelavoxStatus, useHangup } from "@/api/telavox";
import { formatPhone, formatDateTime, formatCurrency, formatDate, formatTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Loader from "@/components/kokonutui/loader";
import type { Lead, CallLog } from "@/api/types";

/* ---------- shared outcome maps (DRY: used in history table + call log) ---------- */

const OUTCOME_LABELS: Record<string, string> = {
  meeting_booked: "Möte bokat",
  callback: "Återuppringning",
  not_interested: "Ej intresserad",
  no_answer: "Ej svar",
  call_later: "Ring senare",
  bad_number: "Fel nummer",
  customer: "Kund",
};

const OUTCOME_COLORS: Record<string, string> = {
  meeting_booked: "bg-emerald-50 text-emerald-700 border-emerald-200",
  callback: "bg-amber-50 text-amber-700 border-amber-200",
  not_interested: "bg-rose-50 text-rose-700 border-rose-200",
  no_answer: "bg-[var(--color-bg-panel)] text-[var(--color-text-secondary)] border-[var(--color-border)]",
  call_later: "bg-blue-50 text-blue-700 border-blue-200",
  bad_number: "bg-red-50 text-red-700 border-red-200",
  customer: "bg-indigo-50 text-indigo-700 border-indigo-200",
};

function formatDuration(seconds: number): string {
  if (seconds === 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

type Tab = "dialer" | "callbacks" | "history" | "meetings";

/* ==================== Main component ==================== */

export function DialerPage() {
  const navigate = useNavigate();

  /* --- tab state --- */
  const [activeTab, setActiveTab] = useState<Tab>("dialer");
  const [currentLeadId, setCurrentLeadId] = useState<string | null>(null);

  /* --- shared hooks --- */
  const { data: user } = useMe();
  const nextLeadMutation = useNextLead();
  const { data: leadData, isLoading: leadLoading } = useLeadDetail(
    currentLeadId ?? undefined,
  );
  const { data: leaderboard } = useLeaderboard();
  const { data: callbacks } = useCallbacks();
  const { data: meetings } = useMeetings();

  /* --- dial / hangup (Telavox) --- */
  const { data: telavoxStatus } = useTelavoxStatus();
  const dial = useDial();
  const hangup = useHangup();
  const [calling, setCalling] = useState(false);

  /* --- skip outcome --- */
  const skipOutcome = useSubmitOutcome(currentLeadId ?? "");

  /* --- auto-load first lead on mount --- */
  useEffect(() => {
    if (!currentLeadId && !nextLeadMutation.isPending && !nextLeadMutation.data) {
      nextLeadMutation.mutate(undefined, {
        onSuccess: (newLead) => {
          if (newLead) setCurrentLeadId(newLead.id);
        },
      });
    }
  }, [currentLeadId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* --- handlers --- */
  function handleNextLead() {
    nextLeadMutation.mutate(undefined, {
      onSuccess: (newLead) => {
        setCurrentLeadId(newLead ? newLead.id : null);
      },
    });
  }

  function handleSkip() {
    if (!currentLeadId) return;
    skipOutcome.mutate(
      { outcome: "no_answer", notes: "Hoppade över" },
      { onSuccess: () => handleNextLead() },
    );
  }

  function handleOutcomeSubmitted() {
    setCalling(false);
    handleNextLead();
  }

  function handleDial() {
    if (!currentLeadId) return;
    dial.mutate(currentLeadId, { onSuccess: () => setCalling(true) });
  }

  function handleHangup() {
    hangup.mutate(undefined, { onSuccess: () => setCalling(false) });
  }

  function handleCallbackClick(lead: Lead) {
    setCurrentLeadId(lead.id);
    setActiveTab("dialer");
  }

  /* --- derived --- */
  const lead = leadData?.lead;
  const calls = leadData?.calls ?? [];
  const hasLead = !!currentLeadId && !!lead;
  const displayPhone = lead ? formatPhone(lead.telefon) : "";

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden">
      {/* ---- Tabs ---- */}
      <DialerTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        callbackCount={callbacks?.length}
        meetingCount={
          meetings?.filter(
            (m) => m.status === "scheduled" && m.meeting_date >= todayISO(),
          ).length
        }
      />

      {/* ---- Tab content ---- */}
      {activeTab === "dialer" && (
        <DialerTabContent
          user={user ?? undefined}
          leaderboard={leaderboard ?? []}
          hasLead={hasLead}
          lead={lead}
          calls={calls}
          leadLoading={leadLoading}
          displayPhone={displayPhone}
          calling={calling}
          telavoxConnected={telavoxStatus?.connected ?? false}
          onDial={handleDial}
          onHangup={handleHangup}
          isDialing={dial.isPending}
          onSkip={handleSkip}
          isSkipping={skipOutcome.isPending}
          onNext={handleNextLead}
          isNexting={nextLeadMutation.isPending}
          onOutcomeSubmitted={handleOutcomeSubmitted}
          currentLeadId={currentLeadId}
          nextLeadData={nextLeadMutation.data}
          nextLeadError={nextLeadMutation.isError}
        />
      )}

      {activeTab === "callbacks" && (
        <CallbacksTabContent
          callbacks={callbacks ?? []}
          onCallbackClick={handleCallbackClick}
        />
      )}

      {activeTab === "history" && <HistoryTabContent />}

      {activeTab === "meetings" && <MeetingsTabContent />}
    </div>
  );
}

/* ==================== Dialer tab ==================== */

interface DialerTabContentProps {
  user?: { id: string; name: string; role: string };
  leaderboard: { user_id: string; name: string; calls_today: number; net_meetings_today: number }[];
  hasLead: boolean;
  lead?: Lead;
  calls: CallLog[];
  leadLoading: boolean;
  displayPhone: string;
  calling: boolean;
  telavoxConnected: boolean;
  onDial: () => void;
  onHangup: () => void;
  isDialing: boolean;
  onSkip: () => void;
  isSkipping: boolean;
  onNext: () => void;
  isNexting: boolean;
  onOutcomeSubmitted: () => void;
  currentLeadId: string | null;
  nextLeadData: Lead | null | undefined;
  nextLeadError: boolean;
}

function DialerTabContent({
  user,
  leaderboard,
  hasLead,
  lead,
  calls,
  leadLoading,
  displayPhone,
  calling,
  telavoxConnected,
  onDial,
  onHangup,
  isDialing,
  onSkip,
  isSkipping,
  onNext,
  isNexting,
  onOutcomeSubmitted,
  currentLeadId,
  nextLeadData,
  nextLeadError,
}: DialerTabContentProps) {
  /* Leaderboard */
  const showLeaderboard = leaderboard.length > 0;

  /* No lead loaded yet */
  if (!currentLeadId) {
    return (
      <div className="flex-1 flex flex-col">
        {showLeaderboard && (
          <MiniLeaderboard entries={leaderboard} currentUserId={user?.id} />
        )}
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          {nextLeadData === null ? (
            <>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Inga fler leads i kön.
              </p>
              <Button variant="primary" size="default" onClick={onNext} disabled={isNexting}>
                Försök igen
              </Button>
            </>
          ) : (
            <Loader size="sm" title="Hämtar nästa kund..." />
          )}
        </div>
      </div>
    );
  }

  /* Loading lead detail */
  if (leadLoading || !lead) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader size="sm" title="Laddar kundkort" subtitle="Hämtar företagsinfo" />
      </div>
    );
  }

  /* ---------- Snabblänkar ---------- */
  const quickLinks = [
    {
      label: "Google",
      url: `https://www.google.com/search?q=${encodeURIComponent(lead.företag + " " + (lead.stad ?? ""))}`,
    },
    {
      label: "Maps",
      url: `https://www.google.com/maps/search/${encodeURIComponent([lead.adress, lead.postnummer, lead.stad].filter(Boolean).join(" "))}`,
    },
    {
      label: "Hitta",
      url: `https://www.hitta.se/sök?vad=${encodeURIComponent(lead.företag)}&var=${encodeURIComponent(lead.stad ?? "")}`,
    },
    {
      label: "Allabolag",
      url: lead.orgnr
        ? `https://www.allabolag.se/${lead.orgnr}`
        : `https://www.allabolag.se/what/${encodeURIComponent(lead.företag)}`,
    },
    {
      label: "Eniro",
      url: `https://www.eniro.se/s/${encodeURIComponent(lead.företag)}`,
    },
    {
      label: "Hemsida",
      url: `https://www.google.com/search?q=${encodeURIComponent('"' + lead.företag + '" hemsida')}`,
    },
    ...(lead.vd_namn
      ? [
          {
            label: "MrKoll",
            url: `https://www.google.com/search?q=${encodeURIComponent(lead.vd_namn + " site:mrkoll.se")}`,
          },
        ]
      : []),
  ];

  /* ---------- Kundinfo grid items ---------- */
  const infoFields: { label: string; value: string | null | undefined }[] = [
    { label: "Företag", value: lead.företag },
    { label: "Telefon", value: formatPhone(lead.telefon) },
    { label: "Stad", value: lead.stad },
    { label: "Adress", value: lead.adress },
    { label: "Bransch", value: lead.bransch },
    {
      label: "Omsättning",
      value: lead.omsättning_tkr ? formatCurrency(Number(lead.omsättning_tkr) * 1000) : null,
    },
    { label: "VD", value: lead.vd_namn },
    { label: "Org.nr", value: lead.orgnr },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Mini leaderboard */}
      {showLeaderboard && (
        <MiniLeaderboard entries={leaderboard} currentUserId={user?.id} />
      )}

      {/* Action bar */}
      <ActionBar
        phone={displayPhone}
        rawPhone={lead?.telefon ?? ""}
        onSkip={onSkip}
        onNext={onNext}
        isSkipping={isSkipping}
        isNexting={isNexting}
      />

      {/* 2-column main content */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 min-h-0 overflow-auto">
        {/* ---- Left column ---- */}
        <div className="p-5 border-r border-[var(--color-border)] bg-[var(--color-bg-primary)]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Sub-left: Kundinfo + snabblänkar */}
            <div>
              <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-secondary)] mb-3">
                Kundinfo
              </p>
              <div className="grid grid-cols-[80px_1fr] gap-y-[5px] gap-x-2.5 text-[13px]">
                {infoFields.map((f) => (
                  <InfoRow key={f.label} label={f.label} value={f.value} />
                ))}
              </div>

              {/* Snabblänkar pills */}
              <div className="mt-3.5 flex flex-wrap gap-1">
                {quickLinks.map((link) => (
                  <a
                    key={link.label}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 rounded border border-[var(--color-border)] px-2 py-[3px] text-[11px] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-panel)] transition-colors"
                  >
                    {link.label}
                    <span className="text-[var(--color-text-secondary)]">{"\u2197"}</span>
                  </a>
                ))}
              </div>
            </div>

            {/* Sub-right: Nummer + Kommentarer */}
            <div className="flex flex-col gap-4">
              {/* Lead phones */}
              <div>
                <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-secondary)] mb-2">
                  Nummer
                </p>
                <div className="flex flex-col gap-[5px]">
                  <div className="flex items-center gap-1.5">
                    <span className="flex-1 font-mono text-xs text-[var(--color-text-primary)]">
                      {formatPhone(lead.telefon)}
                    </span>
                    <span className="rounded bg-emerald-50 px-1.5 py-px text-[10px] text-emerald-600">
                      Primärt
                    </span>
                  </div>
                  {lead.telefon_2 && (
                    <div className="flex items-center gap-1.5">
                      <span className="flex-1 font-mono text-xs text-[var(--color-text-primary)]">
                        {formatPhone(lead.telefon_2)}
                      </span>
                      <span className="rounded bg-[var(--color-bg-panel)] px-1.5 py-px text-[10px] text-[var(--color-text-secondary)]">
                        Växel
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Comments */}
              <div className="flex-1">
                <LeadComments leadId={lead.id} />
              </div>
            </div>
          </div>
        </div>

        {/* ---- Right column: Outcome + notes ---- */}
        <div className="p-5 bg-[var(--color-bg-primary)]">
          <OutcomeInline
            leadId={lead.id}
            companyName={lead.företag}
            leadData={lead}
            onOutcomeSubmitted={onOutcomeSubmitted}
          />
        </div>
      </div>

      {/* ---- Bottom: lead call history ---- */}
      {calls.length > 0 && (
        <div className="border-t border-[var(--color-border)] overflow-x-auto shrink-0">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[var(--color-bg-panel)]">
                {["Datum", "Agent", "Utfall", "Längd", "Anteckning"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-5 py-2 text-left text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)]"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {calls.map((call) => (
                <tr
                  key={call.id}
                  className="border-t border-[var(--color-border)]"
                >
                  <td className="px-5 py-2 font-mono text-xs text-[var(--color-text-secondary)]">
                    {formatDateTime(call.called_at)}
                  </td>
                  <td className="px-5 py-2 font-medium text-[var(--color-accent)]">
                    {call.user_name ?? "—"}
                  </td>
                  <td className="px-5 py-2">
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2.5 py-0.5 text-[11px]",
                        OUTCOME_COLORS[call.outcome] ??
                          "bg-[var(--color-bg-panel)] text-[var(--color-text-secondary)] border-[var(--color-border)]",
                      )}
                    >
                      {OUTCOME_LABELS[call.outcome] ?? call.outcome}
                    </span>
                  </td>
                  <td className="px-5 py-2 text-[var(--color-text-secondary)]">
                    {formatDuration(call.duration)}
                  </td>
                  <td className="px-5 py-2 text-[var(--color-text-secondary)]">
                    {call.notes ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* Helper: single info row in kundinfo grid */
function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <>
      <span className="text-[var(--color-text-secondary)]">{label}</span>
      <span className="font-medium text-[var(--color-text-primary)]">
        {value || "—"}
      </span>
    </>
  );
}

/* ==================== Callbacks tab ==================== */

function CallbacksTabContent({
  callbacks,
  onCallbackClick,
}: {
  callbacks: Lead[];
  onCallbackClick: (lead: Lead) => void;
}) {
  if (callbacks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-[var(--color-text-secondary)]">
          Inga återuppringningar just nu.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-panel)]">
            {["Företag", "Telefon", "Återuppringning", ""].map((h) => (
              <th
                key={h}
                className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {callbacks.map((cb, i) => (
            <tr
              key={cb.id}
              className={cn(
                "cursor-pointer transition-colors hover:bg-[var(--color-bg-panel)]",
                i !== callbacks.length - 1
                  ? "border-b border-[var(--color-border)]"
                  : "",
              )}
              onClick={() => onCallbackClick(cb)}
            >
              <td className="px-5 py-3.5 font-medium text-[var(--color-text-primary)]">
                {cb.företag}
              </td>
              <td className="px-5 py-3.5 font-mono text-[var(--color-text-secondary)]">
                {formatPhone(cb.telefon)}
              </td>
              <td className="px-5 py-3.5 font-mono text-xs text-[var(--color-text-secondary)]">
                {cb.callback_at ? formatDateTime(cb.callback_at) : "—"}
              </td>
              <td className="px-5 py-3.5 text-right">
                <button
                  type="button"
                  className="rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white hover:brightness-110 transition-all"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCallbackClick(cb);
                  }}
                >
                  Öppna i dialer
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ==================== History tab ==================== */

function HistoryTabContent() {
  const [date, setDate] = useState(todayISO);
  const { data: user } = useMe();
  const { data: calls, isLoading } = useCallHistory(date);
  const isAdmin = user?.role === "admin";

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Date picker row */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg-primary)]">
        <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-secondary)]">
          Samtalshistorik
        </p>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-8 rounded-lg border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-3 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
        />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-6">
            <Loader size="sm" title="Laddar samtal..." />
          </div>
        ) : !calls || calls.length === 0 ? (
          <p className="p-6 text-sm text-[var(--color-text-secondary)]">
            Inga samtal {date === todayISO() ? "idag" : `den ${date}`}.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
                  Tid
                </th>
                <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
                  Företag
                </th>
                <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
                  Telefon
                </th>
                {isAdmin && (
                  <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
                    Agent
                  </th>
                )}
                <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
                  Längd
                </th>
                <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
                  Utfall
                </th>
              </tr>
            </thead>
            <tbody>
              {calls.map((call, i) => (
                <tr
                  key={call.id}
                  className={cn(
                    i !== calls.length - 1
                      ? "border-b border-[var(--color-border)]"
                      : "",
                    call.lead_id
                      ? "cursor-pointer transition-colors hover:bg-[var(--color-bg-panel)]"
                      : "",
                  )}
                >
                  <td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs text-[var(--color-text-secondary)]">
                    {formatDateTime(call.called_at)}
                  </td>
                  <td className="px-5 py-3.5 font-medium text-[var(--color-text-primary)]">
                    {call.lead_name ?? "Okänt företag"}
                  </td>
                  <td className="px-5 py-3.5 text-[var(--color-text-secondary)]">
                    {call.lead_phone ?? "—"}
                  </td>
                  {isAdmin && (
                    <td className="px-5 py-3.5 font-medium text-[var(--color-accent)]">
                      {call.user_name ?? "—"}
                    </td>
                  )}
                  <td className="px-5 py-3.5 text-[var(--color-text-secondary)]">
                    {formatDuration(call.duration)}
                  </td>
                  <td className="px-5 py-3.5">
                    {call.outcome ? (
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                          OUTCOME_COLORS[call.outcome] ??
                            "bg-[var(--color-bg-panel)] text-[var(--color-text-secondary)] border-[var(--color-border)]",
                        )}
                      >
                        {OUTCOME_LABELS[call.outcome] ?? call.outcome}
                      </span>
                    ) : (
                      <span className="text-[var(--color-text-secondary)]">
                        —
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ==================== Meetings tab ==================== */

function MeetingsTabContent() {
  const navigate = useNavigate();
  const { data: meetings, isLoading } = useMeetings();
  const cancelMeeting = useCancelMeeting();

  const today = todayISO();
  const upcoming = (meetings ?? []).filter(
    (m) => m.status === "scheduled" && m.meeting_date >= today,
  );

  function handleCancel(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (confirm("Vill du avboka detta möte?")) {
      void cancelMeeting.mutate(id);
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg-primary)]">
        <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-secondary)]">
          Kommande möten
        </p>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-6">
            <Loader size="sm" title="Laddar möten..." />
          </div>
        ) : upcoming.length === 0 ? (
          <p className="p-6 text-sm text-[var(--color-text-secondary)]">
            Inga kommande möten.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                {["Datum & tid", "Titel", "Företag", "Status", ""].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {upcoming.map((meeting, i) => (
                <tr
                  key={meeting.id}
                  className={cn(
                    "cursor-pointer transition-colors hover:bg-[var(--color-bg-panel)]",
                    i !== upcoming.length - 1
                      ? "border-b border-[var(--color-border)]"
                      : "",
                  )}
                  onClick={() => void navigate(`/meetings/${meeting.id}`)}
                >
                  <td className="px-5 py-3.5 font-mono text-[var(--color-text-secondary)]">
                    {formatDate(meeting.meeting_date)}{" "}
                    {formatTime(meeting.meeting_time)}
                  </td>
                  <td className="px-5 py-3.5 text-[var(--color-text-primary)]">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{meeting.title}</span>
                      {meeting.teams_join_url && (
                        <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200">
                          Teams
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-[var(--color-text-primary)]">
                    {meeting.lead?.företag ?? "—"}
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge status={meeting.status} />
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {meeting.status === "scheduled" && (
                      <Button
                        variant="danger"
                        size="default"
                        onClick={(e) => handleCancel(meeting.id, e)}
                        disabled={cancelMeeting.isPending}
                      >
                        Avboka
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
