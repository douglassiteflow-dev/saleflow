import { useState, useEffect } from "react";
import { DialerTabs } from "@/components/dialer/dialer-tabs";
import { DialerHeader } from "@/components/dialer/dialer-header";
import { DialerFooter } from "@/components/dialer/dialer-footer";
import { MiniLeaderboard } from "@/components/dialer/mini-leaderboard";
import { ActionBar } from "@/components/dialer/action-bar";
import { LeadComments } from "@/components/dialer/lead-comments";
import { OutcomeInline } from "@/components/dialer/outcome-inline";
import { MeetingDetailTab } from "@/components/dialer/meeting-detail-tab";
import { LeadDetailTab } from "@/components/dialer/lead-detail-tab";
import { useLeaderboard, useDashboard } from "@/api/dashboard";
import {
  useNextLead,
  useLeadDetail,
  useSubmitOutcome,
  useCallbacks,
} from "@/api/leads";
import { useCallHistory } from "@/api/calls";
import { useMeetings, useCancelMeeting, useUpdateMeeting } from "@/api/meetings";
import { useMe } from "@/api/auth";
import { useDial, useTelavoxStatus, useHangup, useTelavoxConnect, useTelavoxDisconnect } from "@/api/telavox";
import { useMicrosoftStatus, useMicrosoftAuthorize, useMicrosoftDisconnect } from "@/api/microsoft";
import { useMySessions, useLogoutAll } from "@/api/sessions";
import { formatPhone, formatDateTime, formatCurrency, formatDate, formatTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Loader from "@/components/kokonutui/loader";
import { TabToolbar, usePagination, type DateRange } from "@/components/dialer/tab-toolbar";
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

type Tab = "dialer" | "callbacks" | "history" | "meetings" | "profile" | "meeting-detail" | "lead-detail";

/* ==================== Main component ==================== */

export function DialerPage() {
  /* --- tab state --- */
  const [activeTab, setActiveTab] = useState<Tab>("dialer");
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const todayStr = todayISO();
  const [meetingsRange, setMeetingsRange] = useState<DateRange>({ from: todayStr, to: todayStr });
  const [historyRange, setHistoryRange] = useState<DateRange>({ from: todayStr, to: todayStr });
  const [currentLeadId, setCurrentLeadIdRaw] = useState<string | null>(
    () => sessionStorage.getItem("dialer_lead_id"),
  );

  function setCurrentLeadId(id: string | null) {
    if (id) {
      sessionStorage.setItem("dialer_lead_id", id);
    } else {
      sessionStorage.removeItem("dialer_lead_id");
    }
    setCurrentLeadIdRaw(id);
  }

  /* --- shared hooks --- */
  const { data: user } = useMe();
  const nextLeadMutation = useNextLead();
  const { data: leadData, isLoading: leadLoading } = useLeadDetail(
    currentLeadId ?? undefined,
  );
  const { data: leaderboard } = useLeaderboard();
  const { data: dashboard } = useDashboard();
  const { data: callbacks } = useCallbacks();
  const { data: meetings } = useMeetings();

  /* --- meeting update (for notification actions) --- */
  const updateMeeting = useUpdateMeeting();

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
    <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden p-5">
      <div className="flex-1 flex flex-col rounded-[14px] bg-[var(--color-bg-primary)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      {/* ---- Header ---- */}
      <DialerHeader
        userName={user?.name}
        callsToday={dashboard?.my_stats?.calls_today ?? 0}
        meetingsToday={dashboard?.my_stats?.meetings_today ?? 0}
        conversionRate={dashboard?.conversion?.rate ?? 0}
        callbackCount={callbacks?.length}
        onProfileClick={() => setActiveTab("profile")}
        onOpenMeeting={(id) => { setSelectedMeetingId(id); setActiveTab("meeting-detail"); }}
        onOpenLead={(id) => { setCurrentLeadId(id); setActiveTab("dialer"); }}
        onUpdateMeetingStatus={(id, status) => { updateMeeting.mutate({ id, status }); }}
        onRebookMeeting={(id) => { setSelectedMeetingId(id); setActiveTab("meeting-detail"); }}
      />

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

      {activeTab === "history" && (
        <HistoryTabContent
          dateRange={historyRange}
          onDateRangeChange={setHistoryRange}
          onLeadClick={(id) => { setSelectedLeadId(id); setActiveTab("lead-detail"); }}
        />
      )}

      {activeTab === "meetings" && (
        <MeetingsTabContent
          dateRange={meetingsRange}
          onDateRangeChange={setMeetingsRange}
          onMeetingClick={(id) => { setSelectedMeetingId(id); setActiveTab("meeting-detail"); }}
        />
      )}

      {activeTab === "meeting-detail" && selectedMeetingId && (
        <MeetingDetailTab meetingId={selectedMeetingId} onBack={() => setActiveTab("meetings")} />
      )}

      {activeTab === "lead-detail" && selectedLeadId && (
        <LeadDetailTab leadId={selectedLeadId} onBack={() => setActiveTab("history")} />
      )}

      {activeTab === "profile" && <ProfileTabContent onBack={() => setActiveTab("dialer")} />}

      {/* ---- Footer ---- */}
      <DialerFooter
        telavoxConnected={telavoxStatus?.connected ?? false}
      />
      </div>
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
    <div className="flex-1 flex flex-col overflow-auto">

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
      <div className="grid grid-cols-1 lg:grid-cols-2">
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
            {calls.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-4 text-center text-sm text-[var(--color-text-secondary)]">
                  Inga tidigare samtal
                </td>
              </tr>
            ) : (
              calls.map((call) => (
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
              ))
            )}
          </tbody>
        </table>
      </div>
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
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { totalPages, totalCount, paginate } = usePagination(callbacks, search, (cb, q) =>
    cb.företag.toLowerCase().includes(q) || cb.telefon.includes(q),
  );
  const visible = paginate(page);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <TabToolbar
        title="Callbacks"
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        searchPlaceholder="Sök företag..."
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        totalCount={totalCount}
      />
      <div className="flex-1 overflow-auto">
        {visible.length === 0 ? (
          <p className="p-5 text-sm text-[var(--color-text-secondary)]">
            Inga återuppringningar.
          </p>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-[var(--color-bg-panel)]">
                {["Företag", "Telefon", "Återuppringning", ""].map((h) => (
                  <th key={h} className="px-5 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((cb) => (
                <tr key={cb.id} className="border-t border-[var(--color-border)] cursor-pointer transition-colors hover:bg-[var(--color-bg-panel)]" onClick={() => onCallbackClick(cb)}>
                  <td className="px-5 py-2.5 font-medium text-[var(--color-text-primary)]">{cb.företag}</td>
                  <td className="px-5 py-2.5 font-mono text-xs text-[var(--color-text-secondary)]">{formatPhone(cb.telefon)}</td>
                  <td className="px-5 py-2.5 font-mono text-xs text-[var(--color-text-secondary)]">{cb.callback_at ? formatDateTime(cb.callback_at) : "—"}</td>
                  <td className="px-5 py-2.5 text-right">
                    <button type="button" className="rounded-md bg-[var(--color-accent)] px-3 py-1 text-[11px] font-medium text-white hover:brightness-110 transition-all" onClick={(e) => { e.stopPropagation(); onCallbackClick(cb); }}>Öppna</button>
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

/* ==================== History tab ==================== */

function HistoryTabContent({ dateRange, onDateRangeChange, onLeadClick }: { dateRange: DateRange; onDateRangeChange: (r: DateRange) => void; onLeadClick: (leadId: string) => void }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [outcomeFilter, setOutcomeFilter] = useState("");
  const { data: user } = useMe();
  const { data: calls, isLoading } = useCallHistory(dateRange.from);
  const isAdmin = user?.role === "admin";

  // Filter by date range + outcome + search
  const rangeFiltered = (calls ?? []).filter((c) => {
    const d = c.called_at.slice(0, 10);
    return d >= dateRange.from && d <= dateRange.to;
  });

  const outcomeFiltered = outcomeFilter
    ? rangeFiltered.filter((c) => c.outcome === outcomeFilter)
    : rangeFiltered;

  const { totalPages, totalCount, paginate } = usePagination(outcomeFiltered, search, (call, q) =>
    (call.lead_name ?? "").toLowerCase().includes(q) || (call.lead_phone ?? "").includes(q),
  );
  const visible = paginate(page);
  const headers = ["Tid", "Företag", "Telefon", ...(isAdmin ? ["Agent"] : []), "Längd", "Utfall"];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <TabToolbar
        title="Samtalshistorik"
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        searchPlaceholder="Sök företag..."
        dateRange={dateRange}
        onDateRangeChange={(r) => { onDateRangeChange(r); setPage(1); }}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        totalCount={totalCount}
      />
      {/* Outcome filter */}
      <div className="flex items-center gap-1.5 px-5 py-1.5 border-b border-[var(--color-border)] bg-[var(--color-bg-primary)]">
        <span className="text-[10px] text-[var(--color-text-secondary)]">Utfall:</span>
        {[
          { value: "", label: "Alla" },
          { value: "meeting_booked", label: "Möte" },
          { value: "callback", label: "Callback" },
          { value: "not_interested", label: "Ej intresserad" },
          { value: "no_answer", label: "Ej svar" },
          { value: "bad_number", label: "Fel nr" },
        ].map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => { setOutcomeFilter(o.value); setPage(1); }}
            className={cn(
              "px-2 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer",
              outcomeFilter === o.value
                ? "bg-[var(--color-accent)] text-white"
                : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-panel)]",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-5"><Loader size="sm" title="Laddar samtal..." /></div>
        ) : visible.length === 0 ? (
          <p className="p-5 text-sm text-[var(--color-text-secondary)]">
            Inga samtal {date === todayISO() ? "idag" : `den ${date}`}.
          </p>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-[var(--color-bg-panel)]">
                {headers.map((h) => (
                  <th key={h} className="px-5 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((call) => (
                <tr key={call.id} className={`border-t border-[var(--color-border)] transition-colors hover:bg-[var(--color-bg-panel)] ${call.lead_id ? "cursor-pointer" : ""}`} onClick={() => call.lead_id && onLeadClick(call.lead_id)}>
                  <td className="whitespace-nowrap px-5 py-2.5 font-mono text-xs text-[var(--color-text-secondary)]">{formatDateTime(call.called_at)}</td>
                  <td className="px-5 py-2.5 font-medium text-[var(--color-text-primary)]">{call.lead_name ?? "Okänt företag"}</td>
                  <td className="px-5 py-2.5 font-mono text-xs text-[var(--color-text-secondary)]">{call.lead_phone ?? "—"}</td>
                  {isAdmin && <td className="px-5 py-2.5 font-medium text-[var(--color-accent)]">{call.user_name ?? "—"}</td>}
                  <td className="px-5 py-2.5 text-[var(--color-text-secondary)]">{formatDuration(call.duration)}</td>
                  <td className="px-5 py-2.5">
                    {call.outcome ? (
                      <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px]", OUTCOME_COLORS[call.outcome] ?? "bg-[var(--color-bg-panel)] text-[var(--color-text-secondary)] border-[var(--color-border)]")}>{OUTCOME_LABELS[call.outcome] ?? call.outcome}</span>
                    ) : <span className="text-[var(--color-text-secondary)]">—</span>}
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

function MeetingsTabContent({ dateRange, onDateRangeChange, onMeetingClick }: { dateRange: DateRange; onDateRangeChange: (r: DateRange) => void; onMeetingClick: (id: string) => void }) {
  const { data: meetings, isLoading } = useMeetings();
  const cancelMeeting = useCancelMeeting();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Filter: meetings created within date range
  const forDate = (meetings ?? []).filter((m) => {
    const d = m.inserted_at.slice(0, 10);
    return d >= dateRange.from && d <= dateRange.to;
  });

  // Upcoming meetings for calendar sidebar
  const upcoming = (meetings ?? []).filter(
    (m) => m.status === "scheduled" && m.meeting_date >= todayISO(),
  ).sort((a, b) => a.meeting_date.localeCompare(b.meeting_date) || a.meeting_time.localeCompare(b.meeting_time));

  const { totalPages, totalCount, paginate } = usePagination(forDate, search, (m, q) =>
    m.title.toLowerCase().includes(q) || (m.lead?.företag ?? "").toLowerCase().includes(q),
  );
  const visible = paginate(page);

  function handleCancel(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (confirm("Vill du avboka detta möte?")) {
      void cancelMeeting.mutate(id);
    }
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left: Meetings table */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <TabToolbar
          title="Möten"
          search={search}
          onSearchChange={(v) => { setSearch(v); setPage(1); }}
          searchPlaceholder="Sök möte..."
          dateRange={dateRange}
          onDateRangeChange={(r) => { onDateRangeChange(r); setPage(1); }}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          totalCount={totalCount}
        />
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="p-5"><Loader size="sm" title="Laddar möten..." /></div>
          ) : visible.length === 0 ? (
            <p className="p-5 text-sm text-[var(--color-text-secondary)]">
              Inga möten för vald period.
            </p>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-[var(--color-bg-panel)]">
                  {["Skapad", "Mötesdatum", "Tid", "Företag", "Status", ""].map((h) => (
                    <th key={h} className="px-5 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((meeting) => (
                  <tr key={meeting.id} className="border-t border-[var(--color-border)] cursor-pointer transition-colors hover:bg-[var(--color-bg-panel)]" onClick={() => onMeetingClick(meeting.id)}>
                    <td className="px-5 py-2.5 font-mono text-xs text-[var(--color-text-secondary)]">{formatDateTime(meeting.inserted_at)}</td>
                    <td className="px-5 py-2.5 text-[var(--color-text-primary)]">{formatDate(meeting.meeting_date)}</td>
                    <td className="px-5 py-2.5 font-mono text-xs text-[var(--color-text-secondary)]">{formatTime(meeting.meeting_time)}</td>
                    <td className="px-5 py-2.5 text-[var(--color-text-primary)]">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{meeting.lead?.företag ?? meeting.title}</span>
                        {meeting.teams_join_url && <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200">Teams</span>}
                      </div>
                    </td>
                    <td className="px-5 py-2.5"><Badge status={meeting.status} /></td>
                    <td className="px-5 py-2.5 text-right">
                      {meeting.status === "scheduled" && (
                        <button type="button" className="rounded-md bg-[var(--color-danger)] px-3 py-1 text-[11px] font-medium text-white hover:brightness-110 transition-all" onClick={(e) => handleCancel(meeting.id, e)} disabled={cancelMeeting.isPending}>Avboka</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Right: Upcoming meetings calendar */}
      <div className="w-64 shrink-0 border-l border-[var(--color-border)] overflow-auto">
        <div className="px-4 py-2.5 bg-[var(--color-bg-panel)] border-b border-[var(--color-border)]">
          <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)]">Kommande möten</p>
        </div>
        <div className="p-3 space-y-2">
          {upcoming.length === 0 ? (
            <p className="text-xs text-[var(--color-text-secondary)]">Inga kommande möten.</p>
          ) : (
            upcoming.slice(0, 15).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onMeetingClick(m.id)}
                className="w-full text-left rounded-md border border-[var(--color-border)] p-2.5 hover:bg-[var(--color-bg-panel)] transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-[10px] text-[var(--color-text-secondary)]">{formatDate(m.meeting_date)}</span>
                  <span className="font-mono text-[10px] text-[var(--color-accent)]">{formatTime(m.meeting_time)}</span>
                </div>
                <p className="text-xs font-medium text-[var(--color-text-primary)] truncate">{m.lead?.företag ?? m.title}</p>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ==================== Profile tab ==================== */

function ProfileTabContent({ onBack }: { onBack: () => void }) {
  const { data: user } = useMe();
  const { data: telavoxStatus } = useTelavoxStatus();
  const telavoxConnect = useTelavoxConnect();
  const telavoxDisconnect = useTelavoxDisconnect();
  const { data: msStatus } = useMicrosoftStatus();
  const msAuthorize = useMicrosoftAuthorize();
  const msDisconnect = useMicrosoftDisconnect();
  const { data: sessions } = useMySessions();
  const logoutAll = useLogoutAll();
  const [token, setToken] = useState("");

  return (
    <div className="flex-1 overflow-auto p-5">
      <div className="flex items-center gap-3 mb-5">
        <button type="button" onClick={onBack} className="text-[13px] text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] transition-colors cursor-pointer">
          ← Tillbaka
        </button>
        <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)]">
          Profil & Integrationer
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* User info */}
        <div className="rounded-lg border border-[var(--color-border)] p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)] mb-3">Konto</p>
          <p className="text-[15px] font-medium text-[var(--color-text-primary)]">{user?.name}</p>
          <p className="text-[13px] text-[var(--color-text-secondary)] mt-1">{user?.email}</p>
          <span className={`mt-2 inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${user?.role === "admin" ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}>
            {user?.role === "admin" ? "Admin" : "Agent"}
          </span>
        </div>

        {/* Telavox */}
        <div className="rounded-lg border border-[var(--color-border)] p-4">
          <div className="flex items-center gap-2 mb-3">
            <img src="/app-icons/telavox.jpeg" alt="Telavox" className="h-6 w-6 rounded" />
            <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)]">Telavox</p>
          </div>
          {telavoxStatus?.connected ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">Kopplad</span>
                <span className="text-xs text-[var(--color-text-secondary)]">{telavoxStatus.name} — {telavoxStatus.extension}</span>
              </div>
              <button type="button" onClick={() => telavoxDisconnect.mutate()} disabled={telavoxDisconnect.isPending} className="rounded-md bg-[var(--color-danger)] px-3 py-1 text-[11px] font-medium text-white hover:brightness-110 transition-all">
                {telavoxDisconnect.isPending ? "Kopplar bort..." : "Koppla bort"}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-[var(--color-text-secondary)]">Klistra in din Telavox JWT-token.</p>
              <div className="flex gap-2">
                <input type="password" placeholder="eyJ0eXAi..." value={token} onChange={(e) => setToken(e.target.value)} className="flex-1 h-7 rounded-md border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-2 text-xs" />
                <button type="button" onClick={() => { telavoxConnect.mutate(token.trim(), { onSuccess: () => setToken("") }); }} disabled={telavoxConnect.isPending || !token.trim()} className="rounded-md bg-[var(--color-accent)] px-3 py-1 text-[11px] font-medium text-white hover:brightness-110 transition-all disabled:opacity-50">Anslut</button>
              </div>
            </div>
          )}
        </div>

        {/* Microsoft Teams */}
        <div className="rounded-lg border border-[var(--color-border)] p-4">
          <div className="flex items-center gap-2 mb-3">
            <img src="/app-icons/microsoft-teams.png" alt="Microsoft Teams" className="h-6 w-6 rounded" />
            <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)]">Microsoft Teams</p>
          </div>
          {msStatus?.connected ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">Kopplad</span>
                {msStatus.email && <span className="text-xs text-[var(--color-text-secondary)]">{msStatus.email}</span>}
              </div>
              <button type="button" onClick={() => msDisconnect.mutate()} disabled={msDisconnect.isPending} className="rounded-md bg-[var(--color-danger)] px-3 py-1 text-[11px] font-medium text-white hover:brightness-110 transition-all">
                {msDisconnect.isPending ? "Kopplar bort..." : "Koppla bort"}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-[var(--color-text-secondary)]">Koppla ditt Microsoft-konto för Teams-möten.</p>
              <button type="button" onClick={() => msAuthorize.mutate()} disabled={msAuthorize.isPending} className="rounded-md bg-[var(--color-accent)] px-3 py-1 text-[11px] font-medium text-white hover:brightness-110 transition-all">
                {msAuthorize.isPending ? "Ansluter..." : "Koppla Microsoft"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Sessions */}
      <div className="mt-4 rounded-lg border border-[var(--color-border)] p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)]">Sessioner</p>
          <button type="button" onClick={() => logoutAll.mutate()} disabled={logoutAll.isPending} className="rounded-md bg-[var(--color-danger)] px-3 py-1 text-[11px] font-medium text-white hover:brightness-110 transition-all">
            {logoutAll.isPending ? "Loggar ut..." : "Logga ut överallt"}
          </button>
        </div>
        <div className="space-y-0">
          {(sessions ?? []).map((s) => (
            <div key={s.id} className="flex items-center justify-between text-xs text-[var(--color-text-secondary)] py-1.5 border-t border-[var(--color-border)] first:border-0">
              <span>{s.browser} · {s.device_type}{s.current ? " (denna)" : ""}</span>
              <span className="font-mono text-[10px]">{formatDateTime(s.logged_in_at)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

