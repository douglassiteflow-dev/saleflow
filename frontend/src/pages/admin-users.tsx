import { useState } from "react";
import { useAdminUsers, useCreateUser } from "@/api/admin";
import { useUserSessions, useForceLogoutUser, useForceLogoutSession } from "@/api/sessions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardTitle } from "@/components/ui/card";
import { SessionList } from "@/components/session-list";
import type { UserRole } from "@/api/types";

function UserForm({ onCancel }: { onCancel: () => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [role, setRole] = useState<UserRole>("agent");
  const [error, setError] = useState<string | null>(null);

  const createUser = useCreateUser();

  function reset() {
    setEmail("");
    setName("");
    setPassword("");
    setPasswordConfirmation("");
    setRole("agent");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !name.trim() || !password) {
      setError("E-post, namn och lösenord är obligatoriska.");
      return;
    }
    if (password !== passwordConfirmation) {
      setError("Lösenorden stämmer inte överens.");
      return;
    }

    try {
      await createUser.mutateAsync({ email: email.trim(), name: name.trim(), password, role });
      reset();
      onCancel();
    } catch (err) {
      setError((err as Error).message ?? "Något gick fel.");
    }
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-panel)] p-5 space-y-4"
    >
      <p className="font-medium text-[var(--color-text-primary)]" style={{ fontSize: "15px" }}>
        Ny användare
      </p>

      {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

      <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="space-y-1">
          <label
            className="block text-[var(--color-text-secondary)] uppercase tracking-wider"
            style={{ fontSize: "12px" }}
          >
            Namn
          </label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Förnamn Efternamn" />
        </div>

        <div className="space-y-1">
          <label
            className="block text-[var(--color-text-secondary)] uppercase tracking-wider"
            style={{ fontSize: "12px" }}
          >
            E-postadress
          </label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="namn@foretag.se"
          />
        </div>

        <div className="space-y-1">
          <label
            className="block text-[var(--color-text-secondary)] uppercase tracking-wider"
            style={{ fontSize: "12px" }}
          >
            Lösenord
          </label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minst 8 tecken"
          />
        </div>

        <div className="space-y-1">
          <label
            className="block text-[var(--color-text-secondary)] uppercase tracking-wider"
            style={{ fontSize: "12px" }}
          >
            Bekräfta lösenord
          </label>
          <Input
            type="password"
            value={passwordConfirmation}
            onChange={(e) => setPasswordConfirmation(e.target.value)}
            placeholder="Upprepa lösenord"
          />
        </div>

        <div className="space-y-1">
          <label
            className="block text-[var(--color-text-secondary)] uppercase tracking-wider"
            style={{ fontSize: "12px" }}
          >
            Roll
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className="w-full h-9 rounded-[6px] border border-[var(--color-border-input)] bg-white px-3 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          >
            <option value="agent">Agent</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>

      <div className="flex gap-3 pt-1">
        <Button type="submit" variant="primary" disabled={createUser.isPending}>
          {createUser.isPending ? "Sparar..." : "Skapa användare"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Avbryt
        </Button>
      </div>
    </form>
  );
}

function UserSessionsRow({ userId }: { userId: string }) {
  const { data: sessions, isLoading } = useUserSessions(userId);
  const forceLogoutUser = useForceLogoutUser();
  const forceLogoutSession = useForceLogoutSession();

  function handleSessionLogout(sessionId: string) {
    forceLogoutSession.mutate(sessionId);
  }

  function handleLogoutAll() {
    forceLogoutUser.mutate(userId);
  }

  return (
    <div className="px-4 py-3 bg-slate-50">
      <div className="flex items-center justify-between mb-3">
        <p
          className="font-medium text-[var(--color-text-secondary)] uppercase tracking-wider"
          style={{ fontSize: "12px" }}
        >
          Sessioner
        </p>
        <Button
          variant="danger"
          size="default"
          onClick={handleLogoutAll}
          disabled={forceLogoutUser.isPending}
        >
          {forceLogoutUser.isPending ? "Loggar ut..." : "Logga ut alla"}
        </Button>
      </div>
      {isLoading ? (
        <p className="text-sm text-[var(--color-text-secondary)]">Laddar sessioner...</p>
      ) : (
        <SessionList
          sessions={sessions ?? []}
          onLogout={handleSessionLogout}
          showForceLogout
        />
      )}
    </div>
  );
}

export function AdminUsersPage() {
  const [showForm, setShowForm] = useState(false);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const { data: users, isLoading } = useAdminUsers();

  function toggleSessions(userId: string) {
    setExpandedUserId((prev) => (prev === userId ? null : userId));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1
          className="font-semibold text-[var(--color-text-primary)]"
          style={{ fontSize: "24px" }}
        >
          Användare
        </h1>
        <Button
          variant={showForm ? "secondary" : "primary"}
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? "Stäng formulär" : "Ny användare"}
        </Button>
      </div>

      {showForm && <UserForm onCancel={() => setShowForm(false)} />}

      <Card>
        <CardTitle className="mb-4">Alla användare</CardTitle>

        {isLoading ? (
          <p className="text-sm text-[var(--color-text-secondary)]">Laddar användare...</p>
        ) : !users || users.length === 0 ? (
          <p className="text-sm text-[var(--color-text-secondary)]">Inga användare hittades.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th
                    className="px-4 py-2.5 font-medium text-[var(--color-text-secondary)] uppercase tracking-wider"
                    style={{ fontSize: "12px" }}
                  >
                    Namn
                  </th>
                  <th
                    className="px-4 py-2.5 font-medium text-[var(--color-text-secondary)] uppercase tracking-wider"
                    style={{ fontSize: "12px" }}
                  >
                    E-postadress
                  </th>
                  <th
                    className="px-4 py-2.5 font-medium text-[var(--color-text-secondary)] uppercase tracking-wider"
                    style={{ fontSize: "12px" }}
                  >
                    Roll
                  </th>
                  <th
                    className="px-4 py-2.5 font-medium text-[var(--color-text-secondary)] uppercase tracking-wider"
                    style={{ fontSize: "12px" }}
                  >
                    Åtgärder
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((user, i) => (
                  <tr key={user.id}>
                    <td
                      className={`px-4 py-3 font-medium text-[var(--color-text-primary)]${
                        expandedUserId !== user.id && i !== users.length - 1
                          ? " border-b border-slate-200"
                          : ""
                      }`}
                    >
                      {user.name}
                    </td>
                    <td
                      className={`px-4 py-3 text-[var(--color-text-secondary)]${
                        expandedUserId !== user.id && i !== users.length - 1
                          ? " border-b border-slate-200"
                          : ""
                      }`}
                    >
                      {user.email}
                    </td>
                    <td
                      className={`px-4 py-3${
                        expandedUserId !== user.id && i !== users.length - 1
                          ? " border-b border-slate-200"
                          : ""
                      }`}
                    >
                      <span
                        className={
                          user.role === "admin"
                            ? "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium bg-indigo-50 text-indigo-700 border-indigo-200"
                            : "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 border-blue-200"
                        }
                      >
                        {user.role === "admin" ? "Admin" : "Agent"}
                      </span>
                    </td>
                    <td
                      className={`px-4 py-3${
                        expandedUserId !== user.id && i !== users.length - 1
                          ? " border-b border-slate-200"
                          : ""
                      }`}
                    >
                      <Button
                        variant="secondary"
                        size="default"
                        onClick={() => toggleSessions(user.id)}
                      >
                        {expandedUserId === user.id ? "Dölj sessioner" : "Sessioner"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Expanded sessions panel outside the table for better layout */}
            {expandedUserId && (
              <UserSessionsRow userId={expandedUserId} />
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
