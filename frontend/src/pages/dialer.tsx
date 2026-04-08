import { useState, useEffect } from "react";
import { DialerTabs, type DialerTab } from "@/components/dialer/dialer-tabs";
import { DialerHeader } from "@/components/dialer/dialer-header";
import { DialerFooter } from "@/components/dialer/dialer-footer";
import { MeetingDetailTab } from "@/components/dialer/meeting-detail-tab";
import { LeadDetailTab } from "@/components/dialer/lead-detail-tab";
import { DemoTab } from "@/components/dialer/demo-tab";
import { DemoDetailTab } from "@/components/dialer/demo-detail-tab";
import { CustomersTab } from "@/components/dialer/customers-tab";
import { ReportTab } from "@/components/dialer/report-tab";
import { UpdateBanner } from "@/components/dialer/update-banner";
import { CustomerModal } from "@/components/dialer/customer-modal";
import { AudioPlayerBar } from "@/components/audio-player-bar";
import { DialerTabContent } from "@/components/dialer/dialer-tab-content";
import { CallbacksTab } from "@/components/dialer/callbacks-tab";
import { HistoryTab } from "@/components/dialer/history-tab";
import { MeetingsTab } from "@/components/dialer/meetings-tab";
import { ProfileTab } from "@/components/dialer/profile-tab";
import { useLeaderboard, useDashboard } from "@/api/dashboard";
import {
  useNextLead,
  useLeadDetail,
  useSubmitOutcome,
  useCallbacks,
} from "@/api/leads";
import { useMeetings, useUpdateMeeting } from "@/api/meetings";
import { useMe } from "@/api/auth";
import { useDial, useHangup, useTelavoxStatus } from "@/api/telavox";
import { formatPhone } from "@/lib/format";
import { todayISO } from "@/lib/date";
import type { DateRange } from "@/components/dialer/tab-toolbar";
import type { Lead } from "@/api/types";

type Tab = DialerTab | "profile" | "meeting-detail" | "lead-detail" | "demo-detail";

/* ==================== Main component ==================== */

export function DialerPage() {
  /* --- tab state --- */
  const [activeTab, setActiveTab] = useState<Tab>("dialer");
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [selectedDemoConfigId, setSelectedDemoConfigId] = useState<string | null>(null);
  const [demoReturnTab, setDemoReturnTab] = useState<DialerTab>("demo");
  const todayStr = todayISO();
  const [meetingsRange, setMeetingsRange] = useState<DateRange>({ from: todayStr, to: todayStr });
  const [meetingsPreset, setMeetingsPreset] = useState<string | null>("Idag");
  const [historyRange, setHistoryRange] = useState<DateRange>({ from: todayStr, to: todayStr });
  const [historyPreset, setHistoryPreset] = useState<string | null>("Idag");
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

  /* --- dial (Telavox) --- */
  const { data: telavoxStatus } = useTelavoxStatus();
  const dial = useDial();
  const hangup = useHangup();
  const [callModalOpen, setCallModalOpen] = useState(false);
  const [callStart, setCallStart] = useState(0);
  const [callHungUp, setCallHungUp] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

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
      { outcome: "skipped", notes: "Hoppade över" },
      { onSuccess: () => handleNextLead() },
    );
  }

  function handleOutcomeSubmitted() {
    handleNextLead();
  }

  function handleDial() {
    if (!currentLeadId) return;
    dial.mutate(currentLeadId, {
      onSuccess: () => {
        setCallStart(Date.now());
        setCallHungUp(false);
        setCallDuration(0);
        setCallModalOpen(true);
      },
    });
  }

  function handleHangup() {
    const dur = Math.floor((Date.now() - callStart) / 1000);
    setCallDuration(dur);
    setCallHungUp(true);
    hangup.mutate();
  }

  function handleCallModalClose() {
    setCallModalOpen(false);
    handleNextLead();
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
    <div className={`flex flex-col overflow-hidden ${window.location.pathname === "/app" ? "h-screen" : "h-[calc(100vh-64px)] p-5"}`}>
      <div className={`flex-1 flex flex-col bg-[var(--color-bg-primary)] overflow-hidden ${window.location.pathname === "/app" ? "" : "rounded-[14px] shadow-[0_1px_3px_rgba(0,0,0,0.04)]"}`}>
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

      <UpdateBanner />

      {/* ---- Tabs ---- */}
      <DialerTabs
        activeTab={activeTab}
        onTabChange={(tab) => { setSelectedDemoConfigId(null); setActiveTab(tab); }}
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
          telavoxConnected={telavoxStatus?.connected ?? false}
          onDial={handleDial}
          isDialing={dial.isPending}
          onSkip={handleSkip}
          isSkipping={skipOutcome.isPending}
          onNext={handleNextLead}
          isNexting={nextLeadMutation.isPending}
          onOutcomeSubmitted={handleOutcomeSubmitted}
          currentLeadId={currentLeadId}
          nextLeadData={nextLeadMutation.data}
          nextLeadError={nextLeadMutation.isError}
          callDuration={callDuration}
        />
      )}

      {activeTab === "callbacks" && (
        <CallbacksTab
          callbacks={callbacks ?? []}
          onCallbackClick={handleCallbackClick}
        />
      )}

      {activeTab === "history" && (
        <HistoryTab
          dateRange={historyRange}
          onDateRangeChange={(r) => { setHistoryRange(r); setHistoryPreset(null); }}
          activePreset={historyPreset}
          onPresetChange={setHistoryPreset}
          onLeadClick={(id) => { setSelectedLeadId(id); setActiveTab("lead-detail"); }}
          onPlayRecording={setAudioUrl}
        />
      )}

      {activeTab === "meetings" && (
        <MeetingsTab
          dateRange={meetingsRange}
          onDateRangeChange={(r) => { setMeetingsRange(r); setMeetingsPreset(null); }}
          activePreset={meetingsPreset}
          onPresetChange={setMeetingsPreset}
          onMeetingClick={(id) => { setSelectedMeetingId(id); setActiveTab("meeting-detail"); }}
        />
      )}

      {activeTab === "meeting-detail" && selectedMeetingId && (
        <MeetingDetailTab
          meetingId={selectedMeetingId}
          onBack={() => setActiveTab("meetings")}
          onGoToDemo={(demoConfigId) => {
            setSelectedDemoConfigId(demoConfigId);
            setActiveTab("demo-detail");
          }}
        />
      )}

      {activeTab === "lead-detail" && selectedLeadId && (
        <LeadDetailTab leadId={selectedLeadId} onBack={() => setActiveTab("history")} />
      )}

      {activeTab === "demo" && (
        <DemoTab onSelectDemoConfig={(id) => {
          setSelectedDemoConfigId(id);
          setDemoReturnTab("demo");
          setActiveTab("demo-detail");
        }} />
      )}
      {activeTab === "demo-detail" && selectedDemoConfigId && (
        <DemoDetailTab
          demoConfigId={selectedDemoConfigId}
          onBack={() => {
            setSelectedDemoConfigId(null);
            setActiveTab(demoReturnTab);
          }}
        />
      )}

      {activeTab === "customers" && (
        <CustomersTab onSelectDeal={(id) => { setSelectedDemoConfigId(id); setDemoReturnTab("customers"); setActiveTab("demo-detail"); }} />
      )}

      {activeTab === "report" && <ReportTab />}

      {activeTab === "profile" && <ProfileTab onBack={() => setActiveTab("dialer")} />}

      {/* ---- Audio Player ---- */}
      {audioUrl && (
        <AudioPlayerBar url={audioUrl} onClose={() => setAudioUrl(null)} />
      )}

      {/* ---- Footer ---- */}
      <DialerFooter
        telavoxConnected={telavoxStatus?.connected ?? false}
      />
      </div>

      {/* Call modal */}
      {callModalOpen && currentLeadId && (
        <CustomerModal
          leadId={currentLeadId}
          phoneNumber={lead?.telefon ?? ""}
          callStart={callStart}
          hungUp={callHungUp}
          duration={callDuration}
          onHangup={handleHangup}
          onOutcomeSubmitted={handleCallModalClose}
        />
      )}
    </div>
  );
}
