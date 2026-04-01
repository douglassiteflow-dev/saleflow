import type { Lead } from "@/api/types";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPhone, formatCurrency } from "@/lib/format";
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
  const address = [lead.first_name, lead.last_name].filter(Boolean).join(" ");

  // Use lead fields — the Lead type has company, phone, email etc.
  // Extended fields come from the API as unknown extra properties.
  const ext = lead as Lead & {
    org_number?: string | null;
    address?: string | null;
    zip?: string | null;
    city?: string | null;
    industry?: string | null;
    revenue?: number | null;
    profit?: number | null;
    employees?: number | null;
    ceo?: string | null;
    company_type?: string | null;
  };

  return (
    <Card>
      <div className="flex items-start justify-between mb-4">
        <CardTitle>{lead.company ?? address}</CardTitle>
        <Badge status={lead.status} />
      </div>

      <div>
        <InfoRow
          label="Telefon"
          value={
            <a
              href={`tel:${lead.phone}`}
              className="font-mono text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              {formatPhone(lead.phone)}
            </a>
          }
        />
        <InfoRow label="Org.nr" value={ext.org_number} mono />
        <InfoRow label="Adress" value={ext.address} />
        <InfoRow label="Postnummer" value={ext.zip} mono />
        <InfoRow label="Stad" value={ext.city} />
        <InfoRow label="Bransch" value={ext.industry} />
        <InfoRow
          label="Omsättning"
          value={
            ext.revenue != null ? formatCurrency(ext.revenue) : undefined
          }
        />
        <InfoRow
          label="Vinst"
          value={
            ext.profit != null ? formatCurrency(ext.profit) : undefined
          }
        />
        <InfoRow
          label="Anställda"
          value={ext.employees != null ? String(ext.employees) : undefined}
        />
        <InfoRow label="VD" value={ext.ceo} />
        <InfoRow label="Bolagsform" value={ext.company_type} />
        <InfoRow
          label="E-post"
          value={
            lead.email ? (
              <a
                href={`mailto:${lead.email}`}
                className="text-indigo-600 hover:text-indigo-700 transition-colors"
              >
                {lead.email}
              </a>
            ) : undefined
          }
        />
        {lead.notes && <InfoRow label="Anteckningar" value={lead.notes} />}
      </div>
    </Card>
  );
}
