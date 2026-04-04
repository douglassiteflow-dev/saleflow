import { useMicrosoftStatus, useMicrosoftAuthorize, useMicrosoftDisconnect } from "@/api/microsoft";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Loader from "@/components/kokonutui/loader";

export function AppTeamsPage() {
  const { data: status, isLoading } = useMicrosoftStatus();
  const authorize = useMicrosoftAuthorize();
  const disconnect = useMicrosoftDisconnect();

  return (
    <div className="space-y-6">
      <h1 className="text-[22px] font-light tracking-[-0.5px] text-[var(--color-text-primary)]">
        Microsoft Teams
      </h1>

      <Card>
        <div className="space-y-4">
          <CardTitle>Teams-integration</CardTitle>
          {isLoading ? (
            <Loader size="sm" title="Laddar..." />
          ) : status?.connected ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                  Kopplad
                </span>
                {status.email && (
                  <span className="text-sm text-[var(--color-text-secondary)]">
                    {status.email}
                  </span>
                )}
              </div>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Teams-möten skapas automatiskt när du bokar kundmöten. Kalenderinbjudningar skickas direkt till kunden.
              </p>
              <Button variant="danger" size="default" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
                {disconnect.isPending ? "Kopplar bort..." : "Koppla bort"}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-[var(--color-text-secondary)]">
                Koppla ditt Microsoft-konto för att skapa Teams-möten automatiskt vid mötesbokning.
              </p>
              <Button variant="primary" size="default" onClick={() => authorize.mutate()} disabled={authorize.isPending}>
                {authorize.isPending ? "Ansluter..." : "Koppla Microsoft"}
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
