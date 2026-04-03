import { useState } from "react";
import type { Lead } from "@/api/types";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPhone } from "@/lib/format";
import { cn } from "@/lib/cn";
import { api } from "@/api/client";
import { useQueryClient } from "@tanstack/react-query";

interface InfoRowProps {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}

function InfoRow({ label, value, mono }: InfoRowProps) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex flex-col gap-0.5 py-2 border-b border-[var(--color-border)] last:border-0">
      <span className="text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-secondary)]">
        {label}
      </span>
      <span
        className={cn(
          "text-sm text-[var(--color-text-primary)]",
          mono && "font-mono text-[13px]",
        )}
      >
        {value}
      </span>
    </div>
  );
}

interface LeadInfoProps {
  lead: Lead;
}

export function LeadInfo({ lead }: LeadInfoProps) {
  const queryClient = useQueryClient();
  const [editingPhone2, setEditingPhone2] = useState(false);
  const [phone2Value, setPhone2Value] = useState(lead.telefon_2 ?? "");
  const [savingPhone2, setSavingPhone2] = useState(false);

  async function handleSavePhone2() {
    setSavingPhone2(true);
    try {
      await api(`/api/leads/${lead.id}`, {
        method: "PATCH",
        body: JSON.stringify({ telefon_2: phone2Value || null }),
      });
      void queryClient.invalidateQueries({ queryKey: ["leads", "detail", lead.id] });
      setEditingPhone2(false);
    } catch {
      // ignore
    } finally {
      setSavingPhone2(false);
    }
  }

  return (
    <Card>
      <div className="flex items-start justify-between mb-4">
        <CardTitle>{lead.företag}</CardTitle>
        <Badge status={lead.status} />
      </div>

      <div>
        <InfoRow
          label="Telefon"
          value={
            <a
              href={`tel:${lead.telefon}`}
              className="font-mono text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              {formatPhone(lead.telefon)}
            </a>
          }
        />
        <div className="flex flex-col gap-0.5 py-2 border-b border-[var(--color-border)]">
          <span className="text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-secondary)]">
            Telefon 2
          </span>
          {editingPhone2 ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={phone2Value}
                onChange={(e) => setPhone2Value(e.target.value)}
                placeholder="+46..."
                className="flex-1 rounded-md border border-[var(--color-border-input)] bg-white px-2 py-1 text-sm font-mono"
              />
              <button
                type="button"
                onClick={handleSavePhone2}
                disabled={savingPhone2}
                className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
              >
                {savingPhone2 ? "..." : "Spara"}
              </button>
              <button
                type="button"
                onClick={() => { setEditingPhone2(false); setPhone2Value(lead.telefon_2 ?? ""); }}
                className="text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              >
                Avbryt
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {lead.telefon_2 ? (
                <a
                  href={`tel:${lead.telefon_2}`}
                  className="font-mono text-sm text-indigo-600 hover:text-indigo-700 transition-colors"
                >
                  {formatPhone(lead.telefon_2)}
                </a>
              ) : (
                <span className="text-sm text-[var(--color-text-secondary)]">—</span>
              )}
              <button
                type="button"
                onClick={() => { setPhone2Value(lead.telefon_2 ?? ""); setEditingPhone2(true); }}
                className="text-xs text-[var(--color-accent)] hover:underline"
              >
                {lead.telefon_2 ? "Ändra" : "Lägg till"}
              </button>
            </div>
          )}
        </div>
        <InfoRow label="Org.nr" value={lead.orgnr} mono />
        <InfoRow label="Adress" value={lead.adress} />
        <InfoRow label="Postnummer" value={lead.postnummer} mono />
        <InfoRow label="Stad" value={lead.stad} />
        <InfoRow label="Bransch" value={lead.bransch} />
        <InfoRow
          label="Omsättning"
          value={
            lead.omsättning_tkr != null
              ? `${lead.omsättning_tkr} tkr`
              : undefined
          }
        />
        <InfoRow
          label="Vinst"
          value={
            lead.vinst_tkr != null ? `${lead.vinst_tkr} tkr` : undefined
          }
        />
        <InfoRow
          label="Anställda"
          value={lead.anställda != null ? lead.anställda : undefined}
        />
        <InfoRow label="VD" value={lead.vd_namn} />
        <InfoRow label="Bolagsform" value={lead.bolagsform} />
        <InfoRow label="Hemsida" value={lead.hemsida} />
        {lead.källa && (
          <InfoRow
            label="Källa"
            value={
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700">
                {lead.källa}
              </span>
            }
          />
        )}
        <InfoRow
          label="E-post"
          value={
            lead.epost ? (
              <a
                href={`mailto:${lead.epost}`}
                className="text-indigo-600 hover:text-indigo-700 transition-colors"
              >
                {lead.epost}
              </a>
            ) : undefined
          }
        />
      </div>
    </Card>
  );
}
