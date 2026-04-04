import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuditLogs } from "@/api/audit";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/format";
import type { AuditLog } from "@/api/types";
import Loader from "@/components/kokonutui/loader";

const ACTION_OPTIONS = [
  { value: "", label: "Alla händelser" },
  { value: "lead.created", label: "Lead skapad" },
  { value: "lead.status_changed", label: "Status ändrad" },
  { value: "call.logged", label: "Samtal loggat" },
  { value: "meeting.created", label: "Möte skapat" },
  { value: "meeting.cancelled", label: "Möte avbokat" },
  { value: "assignment.created", label: "Tilldelning" },
  { value: "assignment.released", label: "Tilldelning släppt" },
  { value: "quarantine.created", label: "Karantän" },
  { value: "session.created", label: "Inloggning" },
  { value: "session.logged_out", label: "Utloggning" },
  { value: "session.force_logged_out", label: "Tvångsutloggning" },
  { value: "otp.created", label: "OTP skickad" },
  { value: "otp.verified", label: "OTP verifierad" },
];

function actionLabel(action: string): string {
  const found = ACTION_OPTIONS.find((o) => o.value === action);
  return found?.label ?? action;
}

function actionDot(action: string): string {
  if (action.startsWith("meeting.")) return "bg-[var(--color-success)]";
  if (action.startsWith("call.")) return "bg-blue-400";
  if (action.startsWith("lead.status")) return "bg-[var(--color-warning)]";
  return "bg-slate-300";
}

// Fields to hide from audit display (internal/sensitive/noisy)
const HIDDEN_FIELDS = new Set([
  "id", "user_id", "lead_id", "inserted_at", "updated_at", "created_at",
  "session_token", "user_agent", "ip_address", "hashed_password",
  "logged_in_at", "last_active_at",
]);

// Swedish labels for common fields
const FIELD_LABELS: Record<string, string> = {
  status: "Status",
  företag: "Företag",
  telefon: "Telefon",
  epost: "E-post",
  stad: "Stad",
  bransch: "Bransch",
  orgnr: "Org.nr",
  adress: "Adress",
  vd_namn: "VD",
  anställda: "Anställda",
  bolagsform: "Bolagsform",
  outcome: "Utfall",
  notes: "Anteckningar",
  title: "Titel",
  meeting_date: "Mötesdatum",
  meeting_time: "Mötestid",
  callback_at: "Återuppringning",
  quarantine_until: "Karantän till",
  device_type: "Enhet",
  browser: "Webbläsare",
  city: "Stad",
  country: "Land",
  force_logged_out: "Tvångsutloggad",
  release_reason: "Anledning",
  reason: "Anledning",
  reminded_at: "Påmind",
  role: "Roll",
  name: "Namn",
  email: "E-post",
  assigned_at: "Tilldelad",
  released_at: "Släppt",
  called_at: "Samtalstid",
  logged_out_at: "Utloggad",
  code: "Kod",
  expires_at: "Gäller till",
  used_at: "Använd",
  quarantined_at: "Karantän från",
  imported_at: "Importerad",
};

// Friendly values for known enums
const VALUE_LABELS: Record<string, Record<string, string>> = {
  status: {
    new: "Ny",
    assigned: "Tilldelad",
    callback: "Återkom",
    meeting_booked: "Möte bokat",
    quarantine: "Karantän",
    bad_number: "Fel nummer",
    customer: "Kund",
  },
  outcome: {
    meeting_booked: "Möte bokat",
    callback: "Återkom",
    not_interested: "Ej intresserad",
    no_answer: "Ej svar",
    bad_number: "Fel nummer",
    customer: "Kund",
    other: "Övrigt",
  },
  release_reason: {
    outcome_logged: "Utfall loggat",
    timeout: "Timeout",
    manual: "Manuell",
  },
  device_type: {
    desktop: "Dator",
    mobile: "Mobil",
    tablet: "Surfplatta",
  },
  role: {
    admin: "Admin",
    agent: "Säljare",
  },
};

// Fields that contain timestamps
const TIMESTAMP_FIELDS = new Set([
  "assigned_at", "released_at", "called_at", "logged_out_at",
  "expires_at", "used_at", "quarantined_at", "callback_at",
  "quarantine_until", "imported_at", "reminded_at",
]);

function formatValue(field: string, val: unknown): string {
  if (val === null || val === undefined || val === "nil") return "—";
  const str = String(val);
  const labels = VALUE_LABELS[field];
  if (labels && str in labels) return labels[str]!;
  if (str === "true") return "Ja";
  if (str === "false") return "Nej";
  if (TIMESTAMP_FIELDS.has(field) && str.includes("T")) {
    return formatDateTime(str);
  }
  if (str.length > 40) return str.slice(0, 20) + "…";
  return str;
}

// Friendly summaries for actions that typically have no visible changes
const ACTION_SUMMARIES: Record<string, string> = {
  "otp.created": "Verifieringskod skickad",
  "otp.verified": "Verifieringskod godkänd",
};

function changesSummary(changes: Record<string, unknown> | null, action?: string): string {
  if (!changes && action && ACTION_SUMMARIES[action]) return ACTION_SUMMARIES[action];
  if (!changes) return "—";

  const meaningful = Object.entries(changes).filter(
    ([key]) => !HIDDEN_FIELDS.has(key),
  );

  if (meaningful.length === 0 && action && ACTION_SUMMARIES[action]) {
    return ACTION_SUMMARIES[action];
  }

  if (meaningful.length === 0) return "—";

  return meaningful
    .slice(0, 3)
    .map(([key, val]) => {
      const label = FIELD_LABELS[key] ?? key;
      const change = val as { from?: unknown; to?: unknown } | null;

      if (!change || typeof change !== "object") return `${label}: ${formatValue(key, val)}`;

      const from = change.from;
      const to = change.to;

      if (from === null || from === undefined || from === "nil") {
        return `${label}: ${formatValue(key, to)}`;
      }

      return `${label}: ${formatValue(key, from)} → ${formatValue(key, to)}`;
    })
    .join(", ");
}

const RESOURCE_LABELS: Record<string, string> = {
  Lead: "Lead",
  CallLog: "Samtal",
  Meeting: "Möte",
  Assignment: "Tilldelning",
  Quarantine: "Karantän",
  OtpCode: "OTP-kod",
  LoginSession: "Session",
  User: "Användare",
  TrustedDevice: "Betrodd enhet",
  PasswordResetToken: "Lösenordsåterställning",
};

function resourceLabel(resourceType: string | undefined): string {
  if (!resourceType) return "—";
  return RESOURCE_LABELS[resourceType] ?? resourceType;
}

export function AdminLogsPage() {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");

  const navigate = useNavigate();

  const { data: logs, isLoading } = useAuditLogs(
    actionFilter ? { action: actionFilter } : undefined,
  );

  const filtered = (logs ?? []).filter((log: AuditLog) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      log.action.toLowerCase().includes(q) ||
      log.resource_id.toLowerCase().includes(q) ||
      JSON.stringify(log.changes ?? {}).toLowerCase().includes(q)
    );
  });

  function handleRowClick(log: AuditLog) {
    if (log.action.startsWith("lead.") || log.action.startsWith("call.") || log.action.startsWith("meeting.")) {
      void navigate(`/leads/${log.resource_id}`);
    }
  }

  return (
    <div className="space-y-6">
      {/* Rubrik */}
      <div>
        <h1 className="text-[22px] font-light tracking-[-0.5px] text-[var(--color-text-primary)]">
          Händelselogg
        </h1>
      </div>

      {/* Filter */}
      <div className="flex gap-3 flex-wrap">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Sök händelse..."
          className="max-w-xs"
        />
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="h-9 rounded-[10px] border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-3 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
        >
          {ACTION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Tabell */}
      <div className="overflow-hidden rounded-[14px] bg-[var(--color-bg-primary)] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="border-b border-[var(--color-border)] px-[var(--spacing-card)] py-4">
          <h3 className="text-[13px] font-semibold text-[var(--color-text-primary)]">
            Händelselogg
          </h3>
        </div>

        {isLoading ? (
          <div className="p-[var(--spacing-card)]">
            <Loader size="sm" title="Laddar historik" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="p-[var(--spacing-card)] text-sm text-[var(--color-text-secondary)]">
            Inga händelser hittades.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
                    Tidpunkt
                  </th>
                  <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
                    Händelse
                  </th>
                  <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
                    Resurstyp
                  </th>
                  <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
                    Av
                  </th>
                  <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
                    Ändringar
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((log: AuditLog, i: number) => {
                  const isClickable =
                    log.action.startsWith("lead.") ||
                    log.action.startsWith("call.") ||
                    log.action.startsWith("meeting.");
                  return (
                    <tr
                      key={log.id}
                      onClick={() => handleRowClick(log)}
                      className={[
                        i !== filtered.length - 1
                          ? "border-b border-[var(--color-border)]"
                          : "",
                        isClickable
                          ? "cursor-pointer transition-colors hover:bg-[var(--color-bg-panel)]"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs text-[var(--color-text-secondary)]">
                        {formatDateTime(log.inserted_at)}
                      </td>
                      <td className="px-5 py-3.5 text-[var(--color-text-primary)]">
                        <span className="flex items-center gap-2">
                          <span
                            className={`inline-block h-2 w-2 shrink-0 rounded-full ${actionDot(log.action)}`}
                          />
                          {actionLabel(log.action)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-[var(--color-text-secondary)]">
                        {resourceLabel(log.resource_type)}
                      </td>
                      <td className="px-5 py-3.5">
                        {log.user_name ? (
                          <span className="font-medium text-[var(--color-accent)]">
                            {log.user_name}
                          </span>
                        ) : (
                          <span className="text-[var(--color-text-secondary)]">
                            System
                          </span>
                        )}
                      </td>
                      <td className="max-w-xs truncate px-5 py-3.5 text-[var(--color-text-secondary)]">
                        {changesSummary(log.changes, log.action)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
