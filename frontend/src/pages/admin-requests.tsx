import { useState } from "react";
import { useRequests, useUpdateRequest } from "@/api/requests";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { UserRequest } from "@/api/types";
import Loader from "@/components/kokonutui/loader";

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const statusStyles: Record<UserRequest["status"], string> = {
  new: "bg-blue-50 text-blue-700 border-blue-200",
  in_progress: "bg-amber-50 text-amber-700 border-amber-200",
  done: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-slate-100 text-slate-600 border-slate-300",
};

const statusLabels: Record<UserRequest["status"], string> = {
  new: "Ny",
  in_progress: "Pågående",
  done: "Klar",
  rejected: "Avvisad",
};

function StatusBadge({ status }: { status: UserRequest["status"] }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusStyles[status]}`}
    >
      {statusLabels[status]}
    </span>
  );
}

function TypeBadge({ type }: { type: UserRequest["type"] }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        type === "bug"
          ? "bg-rose-50 text-rose-700 border-rose-200"
          : "bg-indigo-50 text-indigo-700 border-indigo-200"
      }`}
    >
      {type === "bug" ? "Bugg" : "Funktion"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Expanded row
// ---------------------------------------------------------------------------

function ExpandedRow({ request, onClose }: { request: UserRequest; onClose: () => void }) {
  const [status, setStatus] = useState<UserRequest["status"]>(request.status);
  const [adminNotes, setAdminNotes] = useState(request.admin_notes ?? "");
  const updateRequest = useUpdateRequest();

  async function handleSave() {
    await updateRequest.mutateAsync({
      id: request.id,
      status,
      admin_notes: adminNotes || undefined,
    });
    onClose();
  }

  return (
    <tr>
      <td colSpan={5} className="px-4 py-4 bg-slate-50 border-b border-slate-200">
        <div className="space-y-4 max-w-2xl">
          <div className="space-y-1">
            <p
              className="text-[var(--color-text-secondary)] uppercase tracking-wider font-medium"
              style={{ fontSize: "12px" }}
            >
              Fullständig beskrivning
            </p>
            <p className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap">
              {request.description}
            </p>
          </div>

          <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="space-y-1.5">
              <label
                className="block text-[var(--color-text-secondary)] uppercase tracking-wider font-medium"
                style={{ fontSize: "12px" }}
              >
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as UserRequest["status"])}
                className="w-full h-9 rounded-[6px] border border-[var(--color-border-input)] bg-white px-3 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              >
                <option value="new">Ny</option>
                <option value="in_progress">Pågående</option>
                <option value="done">Klar</option>
                <option value="rejected">Avvisad</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              className="block text-[var(--color-text-secondary)] uppercase tracking-wider font-medium"
              style={{ fontSize: "12px" }}
            >
              Admin-anteckningar
            </label>
            <textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              placeholder="Skriv ett svar eller interna anteckningar..."
              rows={3}
              className="w-full rounded-[6px] border border-[var(--color-border-input)] bg-white px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] resize-none"
            />
          </div>

          <div className="flex gap-3">
            <Button
              variant="primary"
              size="default"
              onClick={() => void handleSave()}
              disabled={updateRequest.isPending}
            >
              {updateRequest.isPending ? "Sparar..." : "Spara"}
            </Button>
            <Button variant="secondary" size="default" onClick={onClose}>
              Avbryt
            </Button>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function AdminRequestsPage() {
  const { data: requests, isLoading } = useRequests();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<"all" | "bug" | "feature">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | UserRequest["status"]>("all");

  function toggleRow(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  const filtered = (requests ?? []).filter((r) => {
    if (filterType !== "all" && r.type !== filterType) return false;
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1
          className="font-semibold text-[var(--color-text-primary)]"
          style={{ fontSize: "24px" }}
        >
          Förfrågningar
        </h1>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="space-y-1">
          <label
            className="block text-[var(--color-text-secondary)] uppercase tracking-wider font-medium"
            style={{ fontSize: "11px" }}
          >
            Typ
          </label>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as typeof filterType)}
            className="h-9 rounded-[6px] border border-[var(--color-border-input)] bg-white px-3 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          >
            <option value="all">Alla typer</option>
            <option value="bug">Bugg</option>
            <option value="feature">Funktion</option>
          </select>
        </div>

        <div className="space-y-1">
          <label
            className="block text-[var(--color-text-secondary)] uppercase tracking-wider font-medium"
            style={{ fontSize: "11px" }}
          >
            Status
          </label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
            className="h-9 rounded-[6px] border border-[var(--color-border-input)] bg-white px-3 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          >
            <option value="all">Alla statusar</option>
            <option value="new">Ny</option>
            <option value="in_progress">Pågående</option>
            <option value="done">Klar</option>
            <option value="rejected">Avvisad</option>
          </select>
        </div>
      </div>

      <Card>
        <CardTitle className="mb-4">
          Alla förfrågningar {filtered.length > 0 && `(${filtered.length})`}
        </CardTitle>

        {isLoading ? (
          <Loader size="sm" title="Laddar förfrågningar" />
        ) : filtered.length === 0 ? (
          <p className="text-sm text-[var(--color-text-secondary)]">Inga förfrågningar hittades.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th
                    className="px-4 py-2.5 font-medium text-[var(--color-text-secondary)] uppercase tracking-wider"
                    style={{ fontSize: "12px" }}
                  >
                    Datum
                  </th>
                  <th
                    className="px-4 py-2.5 font-medium text-[var(--color-text-secondary)] uppercase tracking-wider"
                    style={{ fontSize: "12px" }}
                  >
                    Användare
                  </th>
                  <th
                    className="px-4 py-2.5 font-medium text-[var(--color-text-secondary)] uppercase tracking-wider"
                    style={{ fontSize: "12px" }}
                  >
                    Typ
                  </th>
                  <th
                    className="px-4 py-2.5 font-medium text-[var(--color-text-secondary)] uppercase tracking-wider"
                    style={{ fontSize: "12px" }}
                  >
                    Beskrivning
                  </th>
                  <th
                    className="px-4 py-2.5 font-medium text-[var(--color-text-secondary)] uppercase tracking-wider"
                    style={{ fontSize: "12px" }}
                  >
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((request, i) => (
                  <>
                    <tr
                      key={request.id}
                      onClick={() => toggleRow(request.id)}
                      className="cursor-pointer hover:bg-slate-50 transition-colors"
                    >
                      <td
                        className={`px-4 py-3 text-[var(--color-text-secondary)]${
                          expandedId !== request.id && i !== filtered.length - 1
                            ? " border-b border-slate-200"
                            : ""
                        }`}
                        style={{ whiteSpace: "nowrap" }}
                      >
                        {new Date(request.inserted_at).toLocaleDateString("sv-SE")}
                      </td>
                      <td
                        className={`px-4 py-3 text-[var(--color-text-primary)]${
                          expandedId !== request.id && i !== filtered.length - 1
                            ? " border-b border-slate-200"
                            : ""
                        }`}
                      >
                        {request.user_name ?? "–"}
                      </td>
                      <td
                        className={`px-4 py-3${
                          expandedId !== request.id && i !== filtered.length - 1
                            ? " border-b border-slate-200"
                            : ""
                        }`}
                      >
                        <TypeBadge type={request.type} />
                      </td>
                      <td
                        className={`px-4 py-3 text-[var(--color-text-primary)] max-w-xs${
                          expandedId !== request.id && i !== filtered.length - 1
                            ? " border-b border-slate-200"
                            : ""
                        }`}
                      >
                        <span className="block truncate">{request.description}</span>
                      </td>
                      <td
                        className={`px-4 py-3${
                          expandedId !== request.id && i !== filtered.length - 1
                            ? " border-b border-slate-200"
                            : ""
                        }`}
                      >
                        <StatusBadge status={request.status} />
                      </td>
                    </tr>
                    {expandedId === request.id && (
                      <ExpandedRow
                        key={`${request.id}-expanded`}
                        request={request}
                        onClose={() => setExpandedId(null)}
                      />
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
