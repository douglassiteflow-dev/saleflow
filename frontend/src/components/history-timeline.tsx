import type { CallLog, AuditLog } from "@/api/types";
import { Card, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";

type TimelineEntry =
  | { kind: "call"; data: CallLog }
  | { kind: "audit"; data: AuditLog };

function getTimestamp(entry: TimelineEntry): string {
  if (entry.kind === "call") return entry.data.called_at;
  return entry.data.inserted_at;
}

interface HistoryTimelineProps {
  callLogs?: CallLog[];
  auditLogs?: AuditLog[];
}

// === LABELS ===

const OUTCOME_LABELS: Record<string, string> = {
  meeting_booked: "Möte bokat",
  callback: "Återuppringning",
  not_interested: "Ej intresserad",
  no_answer: "Ej svar",
  call_later: "Ring senare",
  bad_number: "Fel nummer",
  customer: "Kund",
  other: "Övrigt",
};

const ACTION_LABELS: Record<string, string> = {
  "lead.created": "Lead skapad",
  "lead.imported": "Lead importerad",
  "lead.status_changed": "Status ändrad",
  "call.logged": "Samtal loggat",
  "meeting.created": "Möte bokat",
  "meeting.cancelled": "Möte avbokat",
  "meeting.completed": "Möte genomfört",
  "assignment.created": "Tilldelad agent",
  "assignment.released": "Tilldelning släppt",
  "quarantine.created": "Satt i karantän",
  "otp.created": "OTP skickad",
  "otp.verified": "OTP verifierad",
  "session.created": "Inloggning",
  "session.logged_out": "Utloggning",
  "session.force_logged_out": "Tvångsutloggad",
};

const STATUS_LABELS: Record<string, string> = {
  new: "Ny",
  assigned: "Tilldelad",
  callback: "Återkom",
  meeting_booked: "Möte bokat",
  quarantine: "Karantän",
  bad_number: "Fel nummer",
  customer: "Kund",
};

const RELEASE_LABELS: Record<string, string> = {
  outcome_logged: "Utfall loggat",
  timeout: "Timeout",
  manual: "Manuell",
};

const FIELD_LABELS: Record<string, string> = {
  status: "Status",
  företag: "Företag",
  telefon: "Telefon",
  epost: "E-post",
  stad: "Stad",
  bransch: "Bransch",
  orgnr: "Org.nr",
  vd_namn: "VD",
  anställda: "Anställda",
  omsättning_tkr: "Omsättning",
  vinst_tkr: "Vinst",
  bolagsform: "Bolagsform",
  adress: "Adress",
  postnummer: "Postnummer",
  outcome: "Utfall",
  notes: "Anteckningar",
  title: "Titel",
  meeting_date: "Mötesdatum",
  meeting_time: "Mötestid",
  callback_at: "Återuppringning",
  quarantine_until: "Karantän till",
  release_reason: "Anledning",
  reason: "Anledning",
  lead_list_id: "Lista",
};

// Fields to hide completely
const HIDDEN_FIELDS = new Set([
  "id", "user_id", "lead_id", "inserted_at", "updated_at",
  "imported_at", "session_token", "user_agent", "ip_address",
  "hashed_password", "logged_in_at", "last_active_at",
  "assigned_at", "released_at", "called_at", "expires_at",
  "used_at", "code", "quarantined_at",
]);

// === FORMATTING ===

function friendlyValue(field: string, val: unknown): string {
  if (val === null || val === undefined || val === "nil") return "";
  const str = String(val);

  if (field === "status") return STATUS_LABELS[str] ?? str;
  if (field === "outcome") return OUTCOME_LABELS[str] ?? str;
  if (field === "release_reason") return RELEASE_LABELS[str] ?? str;
  if (str === "true") return "Ja";
  if (str === "false") return "Nej";
  if (str.length > 36 && str.includes("-")) return ""; // UUID, skip
  return str;
}

function formatChanges(changes: Record<string, unknown> | null, action: string): string | null {
  if (!changes) return null;

  // Special handling per action type
  if (action === "lead.status_changed") {
    const s = changes["status"] as { from?: string; to?: string } | undefined;
    if (s) {
      const from = STATUS_LABELS[s.from ?? ""] ?? s.from ?? "";
      const to = STATUS_LABELS[s.to ?? ""] ?? s.to ?? "";
      if (from && to) return `${from} → ${to}`;
      if (to) return to;
    }
  }

  if (action === "call.logged") {
    const o = changes["outcome"] as { from?: string; to?: string } | undefined;
    const outcome = o?.to ? (OUTCOME_LABELS[o.to] ?? o.to) : null;
    const n = changes["notes"] as { from?: string; to?: string } | undefined;
    const notes = n?.to && n.to !== "nil" ? n.to : null;
    return [outcome, notes].filter(Boolean).join(" — ") || null;
  }

  if (action === "lead.created" || action === "lead.imported") {
    // Just show company name + city
    const f = changes["företag"] as { to?: string } | undefined;
    const s = changes["stad"] as { to?: string } | undefined;
    const parts = [f?.to, s?.to].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : null;
  }

  if (action === "meeting.created") {
    const t = changes["title"] as { to?: string } | undefined;
    const d = changes["meeting_date"] as { to?: string } | undefined;
    const tm = changes["meeting_time"] as { to?: string } | undefined;
    const parts = [t?.to, d?.to, tm?.to ? tm.to.slice(0, 5) : null].filter(Boolean);
    return parts.join(" — ") || null;
  }

  if (action === "assignment.released") {
    const r = changes["release_reason"] as { to?: string } | undefined;
    return r?.to ? (RELEASE_LABELS[r.to] ?? r.to) : null;
  }

  if (action === "quarantine.created") {
    const r = changes["reason"] as { to?: string } | undefined;
    return r?.to ?? null;
  }

  // Generic: show meaningful field changes
  const parts: string[] = [];
  for (const [key, val] of Object.entries(changes)) {
    if (HIDDEN_FIELDS.has(key)) continue;
    const change = val as { from?: unknown; to?: unknown } | null;
    if (!change || typeof change !== "object") continue;

    const label = FIELD_LABELS[key] ?? key;
    const from = friendlyValue(key, change.from);
    const to = friendlyValue(key, change.to);

    if (!to) continue;
    if (!from) {
      parts.push(`${label}: ${to}`);
    } else {
      parts.push(`${label}: ${from} → ${to}`);
    }
  }

  return parts.length > 0 ? parts.slice(0, 3).join(", ") : null;
}

// === DOT COLORS ===

function dotColor(entry: TimelineEntry): string {
  if (entry.kind === "call") {
    const outcome = entry.data.outcome;
    if (outcome === "meeting_booked") return "bg-emerald-500";
    if (outcome === "not_interested") return "bg-rose-500";
    if (outcome === "customer") return "bg-indigo-500";
    return "bg-indigo-400";
  }
  const action = entry.data.action;
  if (action === "lead.status_changed") return "bg-amber-400";
  if (action.startsWith("assignment")) return "bg-slate-400";
  return "bg-slate-300";
}

// === COMPONENT ===

export function HistoryTimeline({ callLogs = [], auditLogs = [] }: HistoryTimelineProps) {
  const entries: TimelineEntry[] = [
    ...callLogs.map((c): TimelineEntry => ({ kind: "call", data: c })),
    ...auditLogs.map((a): TimelineEntry => ({ kind: "audit", data: a })),
  ].sort((a, b) => {
    const ta = new Date(getTimestamp(a)).getTime();
    const tb = new Date(getTimestamp(b)).getTime();
    return tb - ta;
  });

  return (
    <Card>
      <CardTitle className="mb-4">Historik</CardTitle>

      {entries.length === 0 ? (
        <p className="text-sm text-[var(--color-text-secondary)]">
          Ingen historik ännu.
        </p>
      ) : (
        <ol className="relative ml-3 space-y-0">
          {entries.map((entry, idx) => {
            const isCall = entry.kind === "call";
            const timestamp = getTimestamp(entry);

            const title = isCall
              ? OUTCOME_LABELS[entry.data.outcome ?? ""] ?? "Samtal"
              : ACTION_LABELS[entry.data.action] ?? entry.data.action;

            const detail = isCall
              ? entry.data.notes
              : formatChanges(entry.data.changes, entry.data.action);

            const source = !isCall && entry.data.resource_type
              ? entry.data.resource_type
              : null;

            const userName = entry.data.user_name;

            return (
              <li key={idx} className="relative pl-6 pb-5 last:pb-0">
                {idx < entries.length - 1 && (
                  <span
                    className="absolute left-[7px] top-3 bottom-0 w-px bg-[var(--color-border)]"
                    aria-hidden
                  />
                )}

                <span
                  className={cn(
                    "absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white",
                    dotColor(entry),
                  )}
                  aria-hidden
                />

                <div>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm font-medium text-[var(--color-text-primary)]">
                      {title}
                    </span>
                    {source && (
                      <span className="text-[11px] text-[var(--color-text-secondary)] bg-slate-100 rounded px-1.5 py-0.5">
                        {source}
                      </span>
                    )}
                    {userName && (
                      <span className="text-[11px] font-semibold text-[var(--color-text-primary)]">
                        — {userName}
                      </span>
                    )}
                    <span className="text-[11px] font-mono text-[var(--color-text-secondary)]">
                      {formatDateTime(timestamp)}
                    </span>
                  </div>

                  {detail && (
                    <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                      {detail}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
