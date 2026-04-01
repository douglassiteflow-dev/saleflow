import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuditLogs } from "@/api/audit";
import { Input } from "@/components/ui/input";
import { Card, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import type { AuditLog } from "@/api/types";

const ACTION_OPTIONS = [
  { value: "", label: "Alla händelser" },
  { value: "lead.created", label: "Lead skapad" },
  { value: "lead.status_changed", label: "Status ändrad" },
  { value: "call.logged", label: "Samtal loggat" },
  { value: "meeting.created", label: "Möte skapat" },
  { value: "lead.assigned", label: "Lead tilldelad" },
  { value: "lead.updated", label: "Lead uppdaterad" },
];

function actionLabel(action: string): string {
  const found = ACTION_OPTIONS.find((o) => o.value === action);
  return found?.label ?? action;
}

function changesSummary(changes: Record<string, unknown> | null): string {
  if (!changes) return "—";
  const entries = Object.entries(changes);
  if (entries.length === 0) return "—";
  return entries
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(", ");
}

function resourceLabel(action: string): string {
  if (action.startsWith("lead.")) return "Lead";
  if (action.startsWith("call.")) return "Samtal";
  if (action.startsWith("meeting.")) return "Möte";
  return "—";
}

export function HistoryPage() {
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1
          className="font-semibold text-[var(--color-text-primary)]"
          style={{ fontSize: "24px" }}
        >
          Historik
        </h1>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Sök händelse, resurs-ID..."
          className="max-w-xs"
        />
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="h-9 rounded-[6px] border border-[var(--color-border-input)] bg-white px-3 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        >
          {ACTION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <Card>
        <CardTitle className="mb-4">Händelselogg</CardTitle>

        {isLoading ? (
          <p className="text-sm text-[var(--color-text-secondary)]">
            Laddar historik...
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-[var(--color-text-secondary)]">
            Inga händelser hittades.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th
                    className="px-4 py-2.5 font-medium text-[var(--color-text-secondary)] uppercase tracking-wider"
                    style={{ fontSize: "12px" }}
                  >
                    Tidpunkt
                  </th>
                  <th
                    className="px-4 py-2.5 font-medium text-[var(--color-text-secondary)] uppercase tracking-wider"
                    style={{ fontSize: "12px" }}
                  >
                    Händelse
                  </th>
                  <th
                    className="px-4 py-2.5 font-medium text-[var(--color-text-secondary)] uppercase tracking-wider"
                    style={{ fontSize: "12px" }}
                  >
                    Resurstyp
                  </th>
                  <th
                    className="px-4 py-2.5 font-medium text-[var(--color-text-secondary)] uppercase tracking-wider"
                    style={{ fontSize: "12px" }}
                  >
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
                          ? "border-b border-slate-200"
                          : "",
                        isClickable
                          ? "cursor-pointer hover:bg-slate-50 transition-colors"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-[var(--color-text-secondary)] whitespace-nowrap">
                        {formatDateTime(log.inserted_at)}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-text-primary)]">
                        {actionLabel(log.action)}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                        {resourceLabel(log.action)}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-text-secondary)] max-w-xs truncate">
                        {changesSummary(log.changes)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
