import { useState } from "react";
import { formatDateTime } from "@/lib/format";
import { useMe } from "@/api/auth";
import { useTelavoxStatus, useTelavoxConnect, useTelavoxDisconnect } from "@/api/telavox";
import { useMicrosoftStatus, useMicrosoftAuthorize, useMicrosoftDisconnect } from "@/api/microsoft";
import { useMySessions, useLogoutAll } from "@/api/sessions";

interface ProfileTabProps {
  onBack: () => void;
}

export function ProfileTab({ onBack }: ProfileTabProps) {
  const { data: user } = useMe();
  const { data: telavoxStatus } = useTelavoxStatus();
  const telavoxConnect = useTelavoxConnect();
  const telavoxDisconnect = useTelavoxDisconnect();
  const { data: msStatus } = useMicrosoftStatus();
  const msAuthorize = useMicrosoftAuthorize();
  const msDisconnect = useMicrosoftDisconnect();
  const { data: sessions } = useMySessions();
  const logoutAll = useLogoutAll();
  const [token, setToken] = useState("");

  return (
    <div className="flex-1 overflow-auto p-5">
      <div className="flex items-center gap-3 mb-5">
        <button type="button" onClick={onBack} className="text-[13px] text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] transition-colors cursor-pointer">
          ← Tillbaka
        </button>
        <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)]">
          Profil & Integrationer
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* User info */}
        <div className="rounded-lg border border-[var(--color-border)] p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)] mb-3">Konto</p>
          <p className="text-[15px] font-medium text-[var(--color-text-primary)]">{user?.name}</p>
          <p className="text-[13px] text-[var(--color-text-secondary)] mt-1">{user?.email}</p>
          <span className={`mt-2 inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${user?.role === "admin" ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}>
            {user?.role === "admin" ? "Admin" : "Agent"}
          </span>
        </div>

        {/* Telavox */}
        <div className="rounded-lg border border-[var(--color-border)] p-4">
          <div className="flex items-center gap-2 mb-3">
            <img src="/app-icons/telavox.jpeg" alt="Telavox" className="h-6 w-6 rounded" />
            <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)]">Telavox</p>
          </div>
          {telavoxStatus?.connected ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">Kopplad</span>
                <span className="text-xs text-[var(--color-text-secondary)]">{telavoxStatus.name} — {telavoxStatus.extension}</span>
              </div>
              <button type="button" onClick={() => telavoxDisconnect.mutate()} disabled={telavoxDisconnect.isPending} className="rounded-md bg-[var(--color-danger)] px-3 py-1 text-[11px] font-medium text-white hover:brightness-110 transition-all">
                {telavoxDisconnect.isPending ? "Kopplar bort..." : "Koppla bort"}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-[var(--color-text-secondary)]">Klistra in din Telavox JWT-token.</p>
              <div className="flex gap-2">
                <input type="password" placeholder="eyJ0eXAi..." value={token} onChange={(e) => setToken(e.target.value)} className="flex-1 h-7 rounded-md border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-2 text-xs" />
                <button type="button" onClick={() => { telavoxConnect.mutate(token.trim(), { onSuccess: () => setToken("") }); }} disabled={telavoxConnect.isPending || !token.trim()} className="rounded-md bg-[var(--color-accent)] px-3 py-1 text-[11px] font-medium text-white hover:brightness-110 transition-all disabled:opacity-50">Anslut</button>
              </div>
            </div>
          )}
        </div>

        {/* Microsoft Teams */}
        <div className="rounded-lg border border-[var(--color-border)] p-4">
          <div className="flex items-center gap-2 mb-3">
            <img src="/app-icons/microsoft-teams.png" alt="Microsoft Teams" className="h-6 w-6 rounded" />
            <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)]">Microsoft Teams</p>
          </div>
          {msStatus?.connected ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">Kopplad</span>
                {msStatus.email && <span className="text-xs text-[var(--color-text-secondary)]">{msStatus.email}</span>}
              </div>
              <button type="button" onClick={() => msDisconnect.mutate()} disabled={msDisconnect.isPending} className="rounded-md bg-[var(--color-danger)] px-3 py-1 text-[11px] font-medium text-white hover:brightness-110 transition-all">
                {msDisconnect.isPending ? "Kopplar bort..." : "Koppla bort"}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-[var(--color-text-secondary)]">Koppla ditt Microsoft-konto för Teams-möten.</p>
              <button type="button" onClick={() => msAuthorize.mutate()} disabled={msAuthorize.isPending} className="rounded-md bg-[var(--color-accent)] px-3 py-1 text-[11px] font-medium text-white hover:brightness-110 transition-all">
                {msAuthorize.isPending ? "Ansluter..." : "Koppla Microsoft"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Sessions */}
      <div className="mt-4 rounded-lg border border-[var(--color-border)] p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)]">Sessioner</p>
          <button type="button" onClick={() => logoutAll.mutate()} disabled={logoutAll.isPending} className="rounded-md bg-[var(--color-danger)] px-3 py-1 text-[11px] font-medium text-white hover:brightness-110 transition-all">
            {logoutAll.isPending ? "Loggar ut..." : "Logga ut överallt"}
          </button>
        </div>
        <div className="space-y-0">
          {(sessions ?? []).map((s) => (
            <div key={s.id} className="flex items-center justify-between text-xs text-[var(--color-text-secondary)] py-1.5 border-t border-[var(--color-border)] first:border-0">
              <span>{s.browser} · {s.device_type}{s.current ? " (denna)" : ""}</span>
              <span className="font-mono text-[10px]">{formatDateTime(s.logged_in_at)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
