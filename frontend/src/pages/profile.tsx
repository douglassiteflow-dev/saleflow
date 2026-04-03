import { useMe } from "@/api/auth";
import { useMySessions, useLogoutAll, useForceLogoutSession } from "@/api/sessions";
import { useMicrosoftStatus, useMicrosoftAuthorize, useMicrosoftDisconnect } from "@/api/microsoft";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SessionList } from "@/components/session-list";
import { TelavoxConnect } from "@/components/telavox-connect";
import Loader from "@/components/kokonutui/loader";

export function ProfilePage() {
  const { data: user } = useMe();
  const { data: sessions, isLoading: sessionsLoading } = useMySessions();
  const logoutAll = useLogoutAll();
  const forceLogoutSession = useForceLogoutSession();
  const { data: msStatus, isLoading: msLoading } = useMicrosoftStatus();
  const msAuthorize = useMicrosoftAuthorize();
  const msDisconnect = useMicrosoftDisconnect();

  function handleSessionLogout(sessionId: string) {
    forceLogoutSession.mutate(sessionId);
  }

  function handleLogoutAll() {
    logoutAll.mutate();
  }

  return (
    <div className="space-y-6">
      <h1
        className="font-semibold text-[var(--color-text-primary)]"
        style={{ fontSize: "24px" }}
      >
        Profil
      </h1>

      {/* User info card */}
      <Card>
        <div className="space-y-3">
          <p className="font-medium text-[var(--color-text-primary)]" style={{ fontSize: "18px" }}>
            {user?.name}
          </p>
          <p className="text-sm text-[var(--color-text-secondary)]">{user?.email}</p>
          <span
            className={
              user?.role === "admin"
                ? "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium bg-indigo-50 text-indigo-700 border-indigo-200"
                : "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 border-blue-200"
            }
          >
            {user?.role === "admin" ? "Admin" : "Agent"}
          </span>
        </div>
      </Card>

      {/* Microsoft Teams card */}
      <Card>
        <div className="space-y-4">
          <CardTitle>Microsoft Teams</CardTitle>
          {msLoading ? (
            <Loader size="sm" title="Laddar..." />
          ) : msStatus?.connected ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                  Kopplad
                </span>
                <span className="text-sm text-[var(--color-text-secondary)]">
                  {msStatus.email}
                </span>
              </div>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Teams-moeten skapas automatiskt vid bokning.
              </p>
              <Button
                variant="danger"
                size="default"
                onClick={() => msDisconnect.mutate()}
                disabled={msDisconnect.isPending}
              >
                {msDisconnect.isPending ? "Kopplar bort..." : "Koppla bort"}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-[var(--color-text-secondary)]">
                Koppla ditt Microsoft-konto for att automatiskt skapa Teams-moeten vid bokning.
              </p>
              <Button
                variant="primary"
                size="default"
                onClick={() => msAuthorize.mutate()}
                disabled={msAuthorize.isPending}
              >
                {msAuthorize.isPending ? "Omdirigerar..." : "Koppla Microsoft Teams"}
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Telavox card */}
      <TelavoxConnect />

      {/* Sessions card */}
      <Card>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <CardTitle>Mina sessioner</CardTitle>
            <Button
              variant="danger"
              size="default"
              onClick={handleLogoutAll}
              disabled={logoutAll.isPending}
            >
              {logoutAll.isPending ? "Loggar ut..." : "Logga ut överallt"}
            </Button>
          </div>

          {sessionsLoading ? (
            <Loader size="sm" title="Laddar profil" />
          ) : (
            <SessionList
              sessions={sessions ?? []}
              onLogout={handleSessionLogout}
            />
          )}
        </div>
      </Card>
    </div>
  );
}
