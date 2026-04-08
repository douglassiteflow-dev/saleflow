import { useState } from "react";
import { useDealDetail } from "@/api/deals";
import { DealStageIndicator } from "@/components/deal-stage-indicator";
import { formatPhone, formatDate, formatTime } from "@/lib/format";
import Loader from "@/components/kokonutui/loader";
import { useSendQuestionnaire } from "@/api/questionnaire-admin";

interface DealDetailTabProps {
  dealId: string;
  onBack: () => void;
}

export function DealDetailTab({ dealId, onBack }: DealDetailTabProps) {
  const { data, isLoading } = useDealDetail(dealId);
  const [copied, setCopied] = useState(false);
  const sendQuestionnaire = useSendQuestionnaire();
  const [questionnaireEmail, setQuestionnaireEmail] = useState("");
  const [questionnaireSent, setQuestionnaireSent] = useState(false);

  if (isLoading || !data) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader size="sm" title="Laddar deal..." />
      </div>
    );
  }

  const { deal, lead, meetings } = data;
  const companyName = deal.lead_name ?? lead.företag;

  // Pre-fill questionnaire email once data is available
  if (questionnaireEmail === "" && lead.epost) {
    setQuestionnaireEmail(lead.epost);
  }

  function handleCopyUrl() {
    if (!deal.website_url) return;
    navigator.clipboard.writeText(deal.website_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex-1 overflow-auto">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-[var(--color-border)]">
        <button type="button" onClick={onBack} className="text-[13px] text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] transition-colors cursor-pointer">
          ← Tillbaka
        </button>
        <span className="text-[var(--color-border)]">|</span>
        <span className="text-[13px] font-medium text-[var(--color-text-primary)]">{companyName}</span>
      </div>

      {/* Stage indicator */}
      <div className="px-5 py-4 border-b border-[var(--color-border)]">
        <DealStageIndicator currentStage={deal.stage} />
      </div>

      {/* Demo link */}
      {deal.website_url && (
        <div className="mx-5 mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-emerald-700 mb-1.5">Demo-länk</p>
          <div className="flex items-center gap-2">
            <a
              href={deal.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] font-medium text-emerald-800 hover:underline truncate"
            >
              {deal.website_url}
            </a>
            <button
              type="button"
              onClick={handleCopyUrl}
              className="shrink-0 rounded-md border border-emerald-300 bg-white px-2.5 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
            >
              {copied ? "Kopierad!" : "Kopiera"}
            </button>
          </div>
        </div>
      )}

      {/* Skicka formulär — meeting_completed stage */}
      {deal.stage === "meeting_completed" && (
        <div className="mx-5 mt-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-panel)] p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)] mb-2">
            Skicka formulär
          </p>
          {questionnaireSent ? (
            <p className="text-[13px] text-emerald-700 font-medium">Formuläret har skickats!</p>
          ) : (
            <div className="space-y-2">
              <input
                type="email"
                value={questionnaireEmail}
                onChange={(e) => setQuestionnaireEmail(e.target.value)}
                placeholder="kund@exempel.se"
                className="flex w-full rounded-md border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-2.5 py-1.5 text-[13px]"
              />
              <button
                type="button"
                disabled={sendQuestionnaire.isPending || !questionnaireEmail}
                onClick={() => {
                  sendQuestionnaire.mutate(
                    { dealId, customerEmail: questionnaireEmail },
                    { onSuccess: () => setQuestionnaireSent(true) },
                  );
                }}
                className="w-full rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[13px] font-medium text-white hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sendQuestionnaire.isPending ? "Skickar..." : "Skicka formulär"}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2">
        {/* Left: Meetings */}
        <div className="p-5 border-r border-[var(--color-border)]">
          <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)] mb-3">Möten</p>
          {meetings.length === 0 ? (
            <p className="text-xs text-[var(--color-text-secondary)]">Inga möten.</p>
          ) : (
            <div className="space-y-2">
              {meetings.map((m) => (
                <div key={m.id} className="bg-[var(--color-bg-panel)] rounded-md p-2.5 text-xs">
                  <div className="flex justify-between mb-1">
                    <span className="font-medium text-[var(--color-text-primary)]">{m.title}</span>
                    <span className="text-[10px] text-[var(--color-text-secondary)]">{m.status}</span>
                  </div>
                  <p className="text-[var(--color-text-secondary)]">
                    {formatDate(m.meeting_date)} {formatTime(m.meeting_time)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Lead info */}
        <div className="p-5">
          <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)] mb-3">Kundinfo</p>
          <div className="space-y-0">
            <DetailRow label="Företag" value={lead.företag} bold />
            <DetailRow label="Telefon" value={formatPhone(lead.telefon)} mono />
            {lead.epost && <DetailRow label="E-post" value={lead.epost} />}
            {lead.adress && <DetailRow label="Adress" value={lead.adress} />}
            {lead.postnummer && <DetailRow label="Postnr" value={lead.postnummer} />}
            {lead.stad && <DetailRow label="Stad" value={lead.stad} />}
            {lead.bransch && <DetailRow label="Bransch" value={lead.bransch} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono, bold }: { label: string; value: string; mono?: boolean; bold?: boolean }) {
  return (
    <div className="flex items-baseline py-2 border-b border-[var(--color-border)] last:border-0">
      <span className="w-24 shrink-0 text-[11px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)]">{label}</span>
      <span className={`text-[13px] text-[var(--color-text-primary)] ${mono ? "font-mono" : ""} ${bold ? "font-medium" : ""}`}>{value}</span>
    </div>
  );
}
