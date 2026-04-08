import { useLeadDetail } from "@/api/leads";
import { useLeadComments, useCreateComment } from "@/api/comments";
import { useDial } from "@/api/telavox";
import { Badge } from "@/components/ui/badge";
import { InfoRow } from "@/components/ui/info-row";
import { HistoryTimeline } from "@/components/history-timeline";
import { CallModal } from "@/components/dialer/call-modal";
import { formatPhone } from "@/lib/format";
import Loader from "@/components/kokonutui/loader";
import { useState } from "react";

interface LeadDetailTabProps {
  leadId: string;
  onBack: () => void;
}

export function LeadDetailTab({ leadId, onBack }: LeadDetailTabProps) {
  const { data, isLoading } = useLeadDetail(leadId);
  const { data: comments } = useLeadComments(leadId);
  const createComment = useCreateComment();
  const dial = useDial();
  const [commentText, setCommentText] = useState("");
  const [callModalOpen, setCallModalOpen] = useState(false);

  if (isLoading || !data) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader size="sm" title="Laddar kundkort..." />
      </div>
    );
  }

  const { lead, calls } = data;

  function handleAddComment() {
    if (!commentText.trim()) return;
    createComment.mutate(
      { leadId, text: commentText.trim() },
      { onSuccess: () => setCommentText("") },
    );
  }

  const mapsQuery = [lead.adress, lead.postnummer, lead.stad].filter(Boolean).join(" ");

  return (
    <div className="flex-1 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} className="text-[13px] text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] transition-colors cursor-pointer">
            ← Tillbaka
          </button>
          <span className="text-[var(--color-border)]">|</span>
          <span className="text-[13px] font-medium text-[var(--color-text-primary)]">{lead.företag}</span>
          <Badge status={lead.status} />
        </div>
        <button
          type="button"
          onClick={() => {
            dial.mutate(leadId, { onSuccess: () => setCallModalOpen(true) });
          }}
          disabled={dial.isPending}
          className="rounded-md bg-[var(--color-success)] px-3 py-1 text-[11px] font-medium text-white hover:brightness-110 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
          {dial.isPending ? "Ringer..." : formatPhone(lead.telefon)}
        </button>
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2">
        {/* Left: Lead info */}
        <div className="p-5 border-r border-[var(--color-border)]">
          <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)] mb-3">Kundinfo</p>
          <div className="space-y-0">
            <InfoRow label="Företag" value={lead.företag} bold />
            <InfoRow label="Telefon" value={formatPhone(lead.telefon)} mono />
            {lead.telefon_2 && <InfoRow label="Telefon 2" value={formatPhone(lead.telefon_2)} mono />}
            {lead.epost && <InfoRow label="E-post" value={lead.epost} />}
            {lead.adress && <InfoRow label="Adress" value={lead.adress} />}
            {lead.postnummer && <InfoRow label="Postnr" value={lead.postnummer} />}
            {lead.stad && <InfoRow label="Stad" value={lead.stad} />}
            {lead.bransch && <InfoRow label="Bransch" value={lead.bransch} />}
            {lead.omsättning_tkr && <InfoRow label="Omsättning" value={`${lead.omsättning_tkr} tkr`} />}
            {lead.vd_namn && <InfoRow label="VD" value={lead.vd_namn} />}
            {lead.orgnr && <InfoRow label="Org.nr" value={lead.orgnr} />}
            {lead.källa && <InfoRow label="Källa" value={lead.källa} />}
          </div>

          {/* Quick links */}
          <div className="mt-4 flex flex-wrap gap-1">
            <QuickLink label="Google" url={`https://www.google.com/search?q=${encodeURIComponent(lead.företag + " " + (lead.stad ?? ""))}`} />
            {mapsQuery && <QuickLink label="Maps" url={`https://www.google.com/maps/search/${encodeURIComponent(mapsQuery)}`} />}
            <QuickLink label="Allabolag" url={lead.orgnr ? `https://www.allabolag.se/${lead.orgnr}` : `https://www.allabolag.se/what/${encodeURIComponent(lead.företag)}`} />
            <QuickLink label="Eniro" url={`https://www.eniro.se/s/${encodeURIComponent(lead.företag)}`} />
          </div>
        </div>

        {/* Right: Comments */}
        <div className="p-5">
          <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)] mb-3">Kommentarer</p>
          <div className="space-y-2 mb-3">
            {(comments ?? []).length === 0 ? (
              <p className="text-xs text-[var(--color-text-secondary)]">Inga kommentarer.</p>
            ) : (
              (comments ?? []).map((c) => (
                <div key={c.id} className="bg-[var(--color-bg-panel)] rounded-md p-2.5 text-xs">
                  <div className="flex justify-between mb-1">
                    <span className="font-medium text-[var(--color-text-primary)]">{c.user_name}</span>
                    <span className="text-[10px] text-[var(--color-text-secondary)]">{new Date(c.inserted_at).toLocaleDateString("sv-SE")}</span>
                  </div>
                  <p className="text-[var(--color-text-secondary)] leading-relaxed">{c.text}</p>
                </div>
              ))
            )}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddComment()}
              placeholder="Kommentar..."
              className="flex-1 h-7 rounded-md border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-2.5 text-xs"
            />
            <button
              type="button"
              onClick={handleAddComment}
              disabled={createComment.isPending || !commentText.trim()}
              className="rounded-md bg-[var(--color-accent)] px-3 py-1 text-[11px] font-medium text-white hover:brightness-110 transition-all disabled:opacity-50"
            >
              Spara
            </button>
          </div>
        </div>
      </div>

      {/* Call history */}
      <div className="border-t border-[var(--color-border)] p-5">
        <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)] mb-3">Samtalshistorik</p>
        {calls && calls.length > 0 ? (
          <HistoryTimeline callLogs={calls} bare />
        ) : (
          <p className="text-sm text-[var(--color-text-secondary)]">Inga samtal med denna kund.</p>
        )}
      </div>

      {callModalOpen && (
        <CallModal
          lead={lead}
          leadId={leadId}
          onClose={() => setCallModalOpen(false)}
        />
      )}
    </div>
  );
}


function QuickLink({ label, url }: { label: string; url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 rounded border border-[var(--color-border)] px-2 py-[3px] text-[11px] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-panel)] transition-colors no-underline">
      {label} ↗
    </a>
  );
}
