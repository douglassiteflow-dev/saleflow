import type { Lead } from "@/api/types";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPhone } from "@/lib/format";
import { cn } from "@/lib/cn";

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
