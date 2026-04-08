import { MiniLeaderboard } from "@/components/dialer/mini-leaderboard";
import { ActionBar } from "@/components/dialer/action-bar";
import { LeadComments } from "@/components/dialer/lead-comments";
import { OutcomeInline } from "@/components/dialer/outcome-inline";
import { formatPhone, formatDateTime, formatCurrency, formatDuration } from "@/lib/format";
import { OUTCOME_LABELS, OUTCOME_COLORS } from "@/lib/constants";
import { cn } from "@/lib/cn";
import Loader from "@/components/kokonutui/loader";
import { Button } from "@/components/ui/button";
import type { Lead, CallLog } from "@/api/types";
import type { LeaderboardEntry } from "@/api/dashboard";

export interface DialerTabContentProps {
  user?: { id: string; name: string; role: string };
  leaderboard: LeaderboardEntry[];
  hasLead: boolean;
  lead?: Lead;
  calls: CallLog[];
  leadLoading: boolean;
  displayPhone: string;
  telavoxConnected: boolean;
  onDial: () => void;
  isDialing: boolean;
  onSkip: () => void;
  isSkipping: boolean;
  onNext: () => void;
  isNexting: boolean;
  onOutcomeSubmitted: () => void;
  currentLeadId: string | null;
  nextLeadData: Lead | null | undefined;
  nextLeadError: boolean;
  callDuration: number;
}

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

export function DialerTabContent({
  user,
  leaderboard,
  lead,
  calls,
  leadLoading,
  displayPhone,
  telavoxConnected,
  onDial,
  isDialing,
  onSkip,
  isSkipping,
  onNext,
  isNexting,
  onOutcomeSubmitted,
  currentLeadId,
  nextLeadData,
  nextLeadError,
  callDuration,
}: DialerTabContentProps) {
  const showLeaderboard = leaderboard.length > 0;

  if (!currentLeadId) {
    return (
      <div className="flex-1 flex flex-col">
        {showLeaderboard && (
          <MiniLeaderboard entries={leaderboard} currentUserId={user?.id} />
        )}
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          {nextLeadError ? (
            <>
              <p className="text-sm text-red-600">
                Kunde inte hämta nästa lead. Försök igen.
              </p>
              <Button variant="primary" size="default" onClick={onNext} disabled={isNexting}>
                Försök igen
              </Button>
            </>
          ) : nextLeadData === null ? (
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

  if (leadLoading || !lead) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader size="sm" title="Laddar kundkort" subtitle="Hämtar företagsinfo" />
      </div>
    );
  }

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
      {showLeaderboard && (
        <MiniLeaderboard entries={leaderboard} currentUserId={user?.id} />
      )}

      <ActionBar
        phone={displayPhone}
        rawPhone={lead?.telefon ?? ""}
        telavoxConnected={telavoxConnected}
        onDial={onDial}
        isDialing={isDialing}
        onSkip={onSkip}
        onNext={onNext}
        isSkipping={isSkipping}
        isNexting={isNexting}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2">
        <div className="p-5 border-r border-[var(--color-border)] bg-[var(--color-bg-primary)]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-secondary)] mb-3">
                Kundinfo
              </p>
              <div className="grid grid-cols-[80px_1fr] gap-y-[5px] gap-x-2.5 text-[13px]">
                {infoFields.map((f) => (
                  <InfoRow key={f.label} label={f.label} value={f.value} />
                ))}
              </div>

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

            <div className="flex flex-col gap-4">
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

              <div className="flex-1">
                <LeadComments leadId={lead.id} />
              </div>
            </div>
          </div>
        </div>

        <div className="p-5 bg-[var(--color-bg-primary)]">
          <OutcomeInline
            leadId={lead.id}
            companyName={lead.företag}
            leadData={lead}
            callDuration={callDuration}
            onOutcomeSubmitted={onOutcomeSubmitted}
          />
        </div>
      </div>

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
