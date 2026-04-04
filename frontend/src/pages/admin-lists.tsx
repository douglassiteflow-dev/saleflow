import { useState } from "react";
import {
  useLeadLists,
  useLeadListLeads,
  useLeadListAgents,
  useAssignAgent,
  useRemoveAgent,
  useUpdateList,
} from "@/api/lists";
import { useAdminUsers } from "@/api/admin";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { LeadList, LeadListStats, User, Lead } from "@/api/types";
import Loader from "@/components/kokonutui/loader";

const statusBadgeStyles: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  paused: "bg-amber-50 text-amber-700 border-amber-200",
  completed: "bg-[var(--color-bg-panel)] text-slate-700 border-slate-300",
};

const statusLabels: Record<string, string> = {
  active: "Aktiv",
  paused: "Pausad",
  completed: "Klar",
};

function ListStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusBadgeStyles[status] ?? ""}`}
    >
      {statusLabels[status] ?? status}
    </span>
  );
}

function StatsBar({ stats }: { stats: LeadListStats }) {
  if (stats.total === 0) return <span className="text-sm text-[var(--color-text-secondary)]">Inga leads</span>;

  const segments = [
    { key: "new", count: stats.new, color: "bg-blue-500", label: "Nya" },
    { key: "assigned", count: stats.assigned, color: "bg-indigo-500", label: "Tilldelade" },
    { key: "callback", count: stats.callback, color: "bg-amber-500", label: "Callback" },
    { key: "meeting_booked", count: stats.meeting_booked, color: "bg-emerald-500", label: "Möte bokat" },
    { key: "customer", count: stats.customer, color: "bg-purple-500", label: "Kund" },
    { key: "quarantine", count: stats.quarantine, color: "bg-orange-500", label: "Karantan" },
    { key: "bad_number", count: stats.bad_number, color: "bg-slate-400", label: "Fel nr" },
  ];

  return (
    <div className="space-y-1">
      <div className="flex h-2 w-full rounded-full overflow-hidden bg-[var(--color-bg-panel)]">
        {segments.map((seg) =>
          seg.count > 0 ? (
            <div
              key={seg.key}
              className={`${seg.color} transition-all`}
              style={{ width: `${(seg.count / stats.total) * 100}%` }}
              title={`${seg.label}: ${seg.count}`}
            />
          ) : null,
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {segments
          .filter((s) => s.count > 0)
          .map((seg) => (
            <span key={seg.key} className="text-xs text-[var(--color-text-secondary)]">
              {seg.label}: {seg.count}
            </span>
          ))}
      </div>
    </div>
  );
}

function AgentCheckboxes({
  listId,
  agents,
  allUsers,
}: {
  listId: string;
  agents: User[];
  allUsers: User[];
}) {
  const assignAgent = useAssignAgent();
  const removeAgent = useRemoveAgent();

  const assignedIds = new Set(agents.map((a) => a.id));

  function handleToggle(userId: string, assigned: boolean) {
    if (assigned) {
      removeAgent.mutate({ listId, userId });
    } else {
      assignAgent.mutate({ listId, userId });
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
        Tilldelade agenter
      </p>
      {allUsers.length === 0 && (
        <p className="text-sm text-[var(--color-text-secondary)]">Inga agenter hittade</p>
      )}
      <div className="space-y-1">
        {allUsers.map((user) => {
          const assigned = assignedIds.has(user.id);
          return (
            <label key={user.id} className="flex items-center gap-2 cursor-pointer py-0.5">
              <input
                type="checkbox"
                checked={assigned}
                onChange={() => handleToggle(user.id, assigned)}
                className="rounded border-[var(--color-border-input)] text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-[var(--color-text-primary)]">
                {user.name} ({user.email})
              </span>
              <span className="text-xs text-[var(--color-text-secondary)]">{user.role}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function LeadTable({ listId }: { listId: string }) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const { data: leads, isLoading } = useLeadListLeads(listId, debouncedSearch);

  function handleSearch(value: string) {
    setSearch(value);
    // Simple debounce
    setTimeout(() => setDebouncedSearch(value), 300);
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
        Leads i listan
      </p>
      <Input
        type="text"
        placeholder="Sök företag..."
        value={search}
        onChange={(e) => handleSearch(e.target.value)}
      />
      {isLoading ? (
        <Loader size="sm" title="Laddar..." />
      ) : !leads || leads.length === 0 ? (
        <p className="text-sm text-[var(--color-text-secondary)]">Inga leads</p>
      ) : (
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-[var(--color-text-secondary)] border-b border-[var(--color-border)]">
                <th className="py-2 pr-3">Företag</th>
                <th className="py-2 pr-3">Telefon</th>
                <th className="py-2 pr-3">Stad</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead: Lead) => (
                <tr key={lead.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="py-2 pr-3 text-[var(--color-text-primary)]">{lead.företag}</td>
                  <td className="py-2 pr-3 text-[var(--color-text-secondary)]">{lead.telefon}</td>
                  <td className="py-2 pr-3 text-[var(--color-text-secondary)]">{lead.stad ?? "-"}</td>
                  <td className="py-2">
                    <Badge status={lead.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ExpandedListDetail({ list, allUsers }: { list: LeadList; allUsers: User[] }) {
  const { data: agents } = useLeadListAgents(list.id);

  return (
    <div className="space-y-5 pt-4 border-t border-[var(--color-border)]">
      {list.stats && <StatsBar stats={list.stats} />}
      <AgentCheckboxes listId={list.id} agents={agents ?? []} allUsers={allUsers} />
      <LeadTable listId={list.id} />
    </div>
  );
}

export function AdminListsPage() {
  const { data: lists, isLoading } = useLeadLists();
  const { data: users } = useAdminUsers();
  const updateList = useUpdateList();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const allUsers = users ?? [];

  function toggleStatus(list: LeadList) {
    const nextStatus = list.status === "active" ? "paused" : "active";
    updateList.mutate({ id: list.id, status: nextStatus });
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("sv-SE");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1
          className="text-[22px] font-light tracking-[-0.5px] text-[var(--color-text-primary)]"
        >
          Listor
        </h1>
      </div>

      {isLoading ? (
        <Loader size="sm" title="Laddar..." />
      ) : !lists || lists.length === 0 ? (
        <Card>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Inga listor hittade. Importera leads med ett listnamn for att skapa en lista.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {lists.map((list) => (
            <Card key={list.id}>
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setExpandedId(expandedId === list.id ? null : list.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <h3 className="text-base font-semibold text-[var(--color-text-primary)] truncate">
                      {list.name}
                    </h3>
                    <ListStatusBadge status={list.status} />
                  </div>
                  {list.description && (
                    <p className="text-sm text-[var(--color-text-secondary)] mt-0.5 truncate">
                      {list.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-6 ml-4 flex-shrink-0">
                  <div className="text-right">
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">
                      {list.stats?.total ?? list.total_count} leads
                    </p>
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      Skapad {formatDate(list.inserted_at)}
                    </p>
                  </div>

                  {list.stats && list.stats.total > 0 && (
                    <div className="hidden md:flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                      <span className="text-blue-600">{list.stats.new} nya</span>
                      <span className="text-emerald-600">{list.stats.meeting_booked} möten</span>
                      <span className="text-purple-600">{list.stats.customer} kunder</span>
                    </div>
                  )}

                  <Button
                    variant="secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleStatus(list);
                    }}
                    disabled={updateList.isPending}
                  >
                    {list.status === "active" ? "Pausa" : "Aktivera"}
                  </Button>
                </div>
              </div>

              {expandedId === list.id && (
                <ExpandedListDetail list={list} allUsers={allUsers} />
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
