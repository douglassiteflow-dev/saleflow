import { useParams, useNavigate } from "react-router-dom";
import { useDealDetail, useAdvanceDeal, useUpdateDeal } from "@/api/deals";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

  const { actionLabel } = getStageConfig(deal.stage);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="secondary" size="default" onClick={() => void navigate("/pipeline")}>
          ← Tillbaka
        </Button>
        <h1 className="text-[22px] font-light tracking-[-0.5px] text-[var(--color-text-primary)]">
          {lead.företag}
        </h1>
      </div>

      {/* Stage indicator */}
      <Card>
        <DealStageIndicator currentStage={deal.stage} />
      </Card>

      {/* Two-column layout */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left column (2/3) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Action card */}
          {deal.stage === "meeting_completed" ? (
            <Card>
              <CardTitle className="mb-4">Nästa steg</CardTitle>
              <SendQuestionnaireForm dealId={deal.id} defaultEmail={lead.epost ?? null} />
            </Card>
          ) : deal.stage === "questionnaire_sent" ? (
            <Card>
              <CardTitle className="mb-4">Nästa steg</CardTitle>
              <SendContractForm dealId={deal.id} defaultEmail={lead.epost ?? null} defaultName={lead.företag ?? null} />
            </Card>
          ) : actionLabel ? (
            <Card>
              <CardTitle className="mb-4">Nästa steg</CardTitle>
              <Button
                variant="primary"
                onClick={handleAdvance}
                disabled={advanceDeal.isPending}
              >
                {advanceDeal.isPending ? "Bearbetar..." : actionLabel}
              </Button>
            </Card>
          ) : null}

          {/* Website URL */}
          {deal.website_url && (
            <Card>
              <CardTitle className="mb-4">Hemsida</CardTitle>
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
            <CardTitle className="mb-4">Möten ({meetings.length})</CardTitle>
            {meetings.length === 0 ? (
              <p className="text-sm text-[var(--color-text-secondary)]">
                Inga möten kopplade
              </p>
            ) : (
              <div className="space-y-3">
                {meetings.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between py-2 border-b border-[var(--color-border)] last:border-0 cursor-pointer hover:bg-[var(--color-bg-panel)] -mx-2 px-2 rounded"
                    onClick={() => void navigate(`/meetings/${m.id}`)}
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
            <div className="flex items-center justify-between mb-4">
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

        {/* Right column (1/3) */}
        <div className="space-y-6">
          <Card>
            <div className="flex items-start justify-between mb-4">
              <CardTitle>{lead.företag}</CardTitle>
              <Badge status={lead.status} />
            </div>
            <div className="space-y-3">
              <InfoRow
                label="Telefon"
                value={
                  <button
                    onClick={() => navigator.clipboard.writeText(lead.telefon)}
                    className="font-mono text-indigo-600 hover:text-indigo-700 cursor-pointer"
                  >
                    {formatPhone(lead.telefon)}
                  </button>
                }
              />
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
                <div className="pt-2">
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

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex flex-col gap-0.5 py-2 border-b border-[var(--color-border)] last:border-0">
      <span className="text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-secondary)]">
        {label}
      </span>
      <span className="text-sm text-[var(--color-text-primary)]">
        {value}
      </span>
    </div>
  );
}
