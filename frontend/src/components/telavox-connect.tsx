import { useState } from "react";
import { useTelavoxStatus, useTelavoxConnect, useTelavoxDisconnect } from "@/api/telavox";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Loader from "@/components/kokonutui/loader";

export function TelavoxConnect() {
  const { data: status, isLoading } = useTelavoxStatus();
  const connect = useTelavoxConnect();
  const disconnect = useTelavoxDisconnect();
  const [token, setToken] = useState("");

  function handleConnect() {
    if (!token.trim()) return;
    connect.mutate(token.trim(), { onSuccess: () => setToken("") });
  }

  return (
    <Card>
      <div className="space-y-4">
        <CardTitle>Telavox</CardTitle>
        {isLoading ? (
          <Loader size="sm" title="Laddar..." />
        ) : status?.connected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                Kopplad
              </span>
              <span className="text-sm text-[var(--color-text-secondary)]">
                {status.name} — {status.extension}
              </span>
            </div>
            <Button variant="danger" size="default" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
              {disconnect.isPending ? "Kopplar bort..." : "Koppla bort"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {status?.expired && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-sm text-amber-800">Din Telavox-token har gått ut. Klistra in en ny token nedan.</p>
              </div>
            )}
            <p className="text-sm text-[var(--color-text-secondary)]">
              Klistra in din Telavox JWT-token för att aktivera click-to-call. Hittas i Telavox Flow under Inställningar.
            </p>
            <div className="flex gap-2">
              <Input type="password" placeholder="eyJ0eXAi..." value={token} onChange={(e) => setToken(e.target.value)} />
              <Button variant="primary" size="default" onClick={handleConnect} disabled={connect.isPending || !token.trim()}>
                {connect.isPending ? "Ansluter..." : "Anslut"}
              </Button>
            </div>
            {connect.isError && (
              <p className="text-sm text-[var(--color-danger)]">{(connect.error as Error).message}</p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
