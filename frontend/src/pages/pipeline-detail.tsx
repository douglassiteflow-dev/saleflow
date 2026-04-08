import { useParams, useNavigate } from "react-router-dom";
import { useDealDetail, useAdvanceDeal, useUpdateDeal } from "@/api/deals";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoRow } from "@/components/ui/info-row";
import { DealStageIndicator } from "@/components/deal-stage-indicator";
import { formatDate, formatTime, formatPhone } from "@/lib/format";
import Loader from "@/components/kokonutui/loader";
import { useState } from "react";
import { getStageConfig } from "@/lib/pipeline-config";
import { SendQuestionnaireForm } from "@/components/pipeline/send-questionnaire-form";
import { SendContractForm } from "@/components/pipeline/send-contract-form";

export function PipelineDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = useDealDetail(id);
  const advanceDeal = useAdvanceDeal();
  const updateDeal = useUpdateDeal();

  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState("");

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader size="sm" title="Laddar deal" />
      </div>
    );
  }

  const { deal, lead, meetings } = data;

  function handleAdvance() {
    if (!id) return;
    advanceDeal.mutate(id);
  }

  function startEditNotes() {
    setNotesValue(deal.notes ?? "");
    setEditingNotes(true);
  }

  function saveNotes() {
    if (!id) return;
    updateDeal.mutate(
      { id, notes: notesValue },
      { onSuccess: () => setEditingNotes(false) },
    );
  }

  const mapsQuery = [lead.adress, lead.postnummer, lead.stad]
    .filter(Boolean)
    .join(" ");
  const mapsUrl = mapsQuery
    ? `https://www.google.com/maps/search/${encodeURIComponent(mapsQuery)}`
    : null;

  const stageConfig = getStageConfig(deal.stage);
  const { actionLabel } = stageConfig;

  // Find the next upcoming meeting for demo_scheduled
  const upcomingMeeting = meetings.find((m) => m.status === "scheduled");

  return (
    <div className="space-y-6">
      {/* Header — matches dashboard typography */}
      <div className="flex items-center gap-4">
        <Button variant="secondary" size="default" onClick={() => void navigate("/pipeline")}>
          <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Tillbaka
        </Button>
        <div className="min-w-0">
          <h1 className="text-[22px] font-light tracking-[-0.5px] text-[var(--color-text-primary)] truncate">
            {lead.företag}
          </h1>
          <p className="mt-0.5 text-[13px] text-[var(--color-text-secondary)]">
            {stageConfig.label}
          </p>
        </div>
      </div>

      {/* Stage indicator — prominent at top */}
      <div className="rounded-[14px] bg-[var(--color-bg-primary)] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <DealStageIndicator currentStage={deal.stage} />
      </div>

      {/* Two-column layout — responsive for dialer sidebar */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main content (2/3) */}
        <div className="lg:col-span-2 space-y-6">
          {/* === Next action card — most prominent element === */}
          <NextActionCard
            deal={deal}
            lead={lead}
            upcomingMeeting={upcomingMeeting ?? null}
            actionLabel={actionLabel}
            onAdvance={handleAdvance}
            isPending={advanceDeal.isPending}
          />

          {/* Website URL */}
          {deal.website_url && (
            <Card>
              <CardTitle className="mb-3">Hemsida</CardTitle>
              <a
                href={deal.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-indigo-600 hover:text-indigo-700 transition-colors break-all"
              >
                {deal.website_url}
              </a>
            </Card>
          )}

          {/* Meetings */}
          <Card>
            <CardTitle className="mb-3">Möten ({meetings.length})</CardTitle>
            {meetings.length === 0 ? (
              <p className="text-sm text-[var(--color-text-secondary)]">
                Inga möten kopplade
              </p>
            ) : (
              <div className="space-y-1">
                {meetings.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between py-2.5 border-b border-[var(--color-border)] last:border-0 cursor-pointer hover:bg-[var(--color-bg-panel)] -mx-2 px-2 rounded transition-colors"
                    role="button"
                    tabIndex={0}
                    onClick={() => void navigate(`/meetings/${m.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") void navigate(`/meetings/${m.id}`);
                    }}
                  >
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text-primary)]">
                        {m.title}
                      </p>
                      <p className="text-xs text-[var(--color-text-secondary)]">
                        {formatDate(m.meeting_date)} {formatTime(m.meeting_time)}
                      </p>
                    </div>
                    <Badge status={m.status} />
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Notes */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <CardTitle>Anteckningar</CardTitle>
              {!editingNotes && (
                <Button variant="secondary" size="default" onClick={startEditNotes}>
                  Redigera
                </Button>
              )}
            </div>
            {editingNotes ? (
              <div className="space-y-3">
                <textarea
                  value={notesValue}
                  onChange={(e) => setNotesValue(e.target.value)}
                  rows={4}
                  className="flex w-full rounded-md border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm resize-y"
                />
                <div className="flex gap-2">
                  <Button variant="primary" onClick={saveNotes} disabled={updateDeal.isPending}>
                    {updateDeal.isPending ? "Sparar..." : "Spara"}
                  </Button>
                  <Button variant="secondary" onClick={() => setEditingNotes(false)}>
                    Avbryt
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap">
                {deal.notes ?? "Inga anteckningar"}
              </p>
            )}
          </Card>
        </div>

        {/* Right column (1/3) — compact lead info */}
        <div className="space-y-6">
          <Card>
            <div className="flex items-start justify-between mb-3">
              <CardTitle className="text-[15px]">{lead.företag}</CardTitle>
              <Badge status={lead.status} />
            </div>
            <div className="space-y-0">
              <InfoRow label="Telefon">
                <button
                  onClick={() => navigator.clipboard.writeText(lead.telefon)}
                  className="font-mono text-indigo-600 hover:text-indigo-700 cursor-pointer"
                >
                  {formatPhone(lead.telefon)}
                </button>
              </InfoRow>
              <InfoRow label="E-post" value={lead.epost} />
              <InfoRow label="Adress" value={lead.adress} />
              <InfoRow label="Postnummer" value={lead.postnummer} />
              <InfoRow label="Stad" value={lead.stad} />
              <InfoRow label="Bransch" value={lead.bransch} />
              <InfoRow
                label="Omsättning"
                value={lead.omsättning_tkr != null ? `${lead.omsättning_tkr} tkr` : null}
              />
              <InfoRow label="VD" value={lead.vd_namn} />
              {mapsUrl && (
                <div className="pt-3">
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full h-10 rounded-md bg-[var(--color-accent)] text-white font-medium text-sm hover:bg-[var(--color-accent-hover)] transition-colors"
                  >
                    Visa på Google Maps
                  </a>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Next-action card — adapts per stage                                */
/* ------------------------------------------------------------------ */

interface NextActionCardProps {
  deal: { id: string; stage: string; website_url: string | null; inserted_at: string };
  lead: { epost: string | null; företag: string | null };
  upcomingMeeting: { meeting_date: string; meeting_time: string; teams_join_url: string | null } | null;
  actionLabel: string;
  onAdvance: () => void;
  isPending: boolean;
}

function NextActionCard({ deal, lead, upcomingMeeting, actionLabel, onAdvance, isPending }: NextActionCardProps) {
  // meeting_completed: send questionnaire form
  if (deal.stage === "meeting_completed") {
    return (
      <Card className="border-l-4 border-l-emerald-500">
        <p className="text-[11px] font-medium uppercase tracking-[1px] text-[var(--color-text-secondary)] mb-3">
          Nästa steg
        </p>
        <SendQuestionnaireForm dealId={deal.id} defaultEmail={lead.epost ?? null} />
      </Card>
    );
  }

  // questionnaire_sent: send contract form
  if (deal.stage === "questionnaire_sent") {
    return (
      <Card className="border-l-4 border-l-cyan-500">
        <p className="text-[11px] font-medium uppercase tracking-[1px] text-[var(--color-text-secondary)] mb-3">
          Nästa steg
        </p>
        <SendContractForm dealId={deal.id} defaultEmail={lead.epost ?? null} defaultName={lead.företag ?? null} />
      </Card>
    );
  }

  // demo_scheduled: show meeting date + demo link prominently
  if (deal.stage === "demo_scheduled") {
    return (
      <Card className="border-l-4 border-l-purple-500">
        <p className="text-[11px] font-medium uppercase tracking-[1px] text-[var(--color-text-secondary)] mb-3">
          Nästa steg
        </p>
        {upcomingMeeting ? (
          <div className="mb-4 rounded-lg bg-purple-50 p-4">
            <p className="text-[15px] font-medium text-purple-800">
              Demo: {formatDate(upcomingMeeting.meeting_date)} kl {formatTime(upcomingMeeting.meeting_time)}
            </p>
            {upcomingMeeting.teams_join_url && (
              <a
                href={upcomingMeeting.teams_join_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-purple-600 hover:text-purple-700 font-medium"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                Anslut till Teams-möte
              </a>
            )}
          </div>
        ) : (
          <div className="mb-4 rounded-lg bg-purple-50 p-4">
            <p className="text-[13px] text-purple-700">
              Demo schemalagd — inväntar mötesdatum
            </p>
          </div>
        )}
        <Button
          variant="primary"
          onClick={onAdvance}
          disabled={isPending}
        >
          {isPending ? "Bearbetar..." : actionLabel}
        </Button>
      </Card>
    );
  }

  // contract_sent: show status + advance
  if (deal.stage === "contract_sent") {
    return (
      <Card className="border-l-4 border-l-orange-500">
        <p className="text-[11px] font-medium uppercase tracking-[1px] text-[var(--color-text-secondary)] mb-3">
          Nästa steg
        </p>
        <div className="mb-4 rounded-lg bg-orange-50 p-4">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-orange-400 animate-pulse" />
            <p className="text-[13px] font-medium text-orange-700">
              Avtal skickat — inväntar signering
            </p>
          </div>
        </div>
        <Button
          variant="primary"
          onClick={onAdvance}
          disabled={isPending}
        >
          {isPending ? "Bearbetar..." : actionLabel}
        </Button>
      </Card>
    );
  }

  // won: journey summary
  if (deal.stage === "won") {
    const daysTotal = Math.floor((Date.now() - new Date(deal.inserted_at).getTime()) / 86400000);
    return (
      <Card className="border-l-4 border-l-green-500 bg-green-50/30">
        <p className="text-[11px] font-medium uppercase tracking-[1px] text-green-700 mb-2">
          Kund
        </p>
        <p className="text-sm text-[var(--color-text-primary)]">
          {lead.företag} blev kund efter {daysTotal} {daysTotal === 1 ? "dag" : "dagar"} i pipeline.
        </p>
      </Card>
    );
  }

  // booking_wizard + other stages: simple advance button
  if (actionLabel) {
    return (
      <Card className="border-l-4 border-l-blue-500">
        <p className="text-[11px] font-medium uppercase tracking-[1px] text-[var(--color-text-secondary)] mb-3">
          Nästa steg
        </p>
        <Button
          variant="primary"
          onClick={onAdvance}
          disabled={isPending}
        >
          {isPending ? "Bearbetar..." : actionLabel}
        </Button>
      </Card>
    );
  }

  return null;
}

