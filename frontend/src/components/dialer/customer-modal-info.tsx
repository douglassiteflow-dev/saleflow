import { useState } from "react";
import { useUpdateLead } from "@/api/leads";
import { useContacts, useCreateContact } from "@/api/contacts";
import { InlineEditField } from "@/components/dialer/inline-edit-field";
import { LeadComments } from "@/components/dialer/lead-comments";
import { formatPhone } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { Lead } from "@/api/types";

interface CustomerModalInfoProps {
  lead: Lead;
  leadId: string;
  onDial: (number: string) => void;
  activePhoneNumber?: string;
}

export function CustomerModalInfo({
  lead,
  leadId,
  onDial,
  activePhoneNumber,
}: CustomerModalInfoProps) {
  const updateLead = useUpdateLead(leadId);
  const { data: contacts } = useContacts(leadId);
  const createContact = useCreateContact(leadId);

  const [showAddPhone, setShowAddPhone] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [showAddContact, setShowAddContact] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactRole, setContactRole] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  function handleAddPhone() {
    const trimmed = newPhone.trim();
    if (!trimmed) return;
    updateLead.mutate(
      { telefon_2: trimmed },
      {
        onSuccess: () => {
          setNewPhone("");
          setShowAddPhone(false);
        },
      },
    );
  }

  function handleAddContact() {
    const name = contactName.trim();
    if (!name) return;
    createContact.mutate(
      {
        name,
        role: contactRole.trim() || null,
        phone: contactPhone.trim() || null,
      },
      {
        onSuccess: () => {
          setContactName("");
          setContactRole("");
          setContactPhone("");
          setShowAddContact(false);
        },
      },
    );
  }

  const phones: { number: string; tag: string }[] = [
    { number: lead.telefon, tag: "Huvud" },
  ];
  if (lead.telefon_2) {
    phones.push({ number: lead.telefon_2, tag: "Tillagd" });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2" data-testid="info-tab">
      {/* Left column: Customer data */}
      <div className="p-5 border-r border-[var(--color-border)]">
        {/* Phone section */}
        <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)] mb-3">
          Telefonnummer
        </p>
        <div className="space-y-1.5 mb-4">
          {phones.map((p) => {
            const isActive = activePhoneNumber === p.number;
            return (
              <div key={p.number} className="flex items-center gap-2">
                <span
                  className={cn(
                    "font-mono text-[13px]",
                    isActive
                      ? "text-[var(--color-success)] font-medium"
                      : "text-[var(--color-text-primary)]",
                  )}
                >
                  {formatPhone(p.number)}
                </span>
                <span className="text-[10px] text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded px-1.5 py-px">
                  {p.tag}
                </span>
                {isActive ? (
                  <span className="ml-auto text-[11px] font-medium text-[var(--color-success)]">
                    ● Pågår
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onDial(p.number)}
                    className="ml-auto rounded-md bg-[var(--color-success)] px-2.5 py-[3px] text-[11px] font-medium text-white hover:brightness-110 transition-all cursor-pointer"
                  >
                    Ring
                  </button>
                )}
              </div>
            );
          })}

          {/* Add phone inline */}
          {showAddPhone ? (
            <div className="flex items-center gap-1.5 mt-1">
              <input
                type="text"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddPhone()}
                placeholder="+46..."
                className="flex-1 h-7 rounded-md border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-2 text-xs"
              />
              <button
                type="button"
                onClick={handleAddPhone}
                disabled={!newPhone.trim() || updateLead.isPending}
                className="rounded-md bg-[var(--color-accent)] px-2.5 py-[3px] text-[11px] font-medium text-white hover:brightness-110 transition-all disabled:opacity-50 cursor-pointer"
              >
                Spara
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddPhone(false);
                  setNewPhone("");
                }}
                className="text-[11px] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] cursor-pointer"
              >
                Avbryt
              </button>
            </div>
          ) : (
            !lead.telefon_2 && (
              <button
                type="button"
                onClick={() => setShowAddPhone(true)}
                className="text-[11px] text-[var(--color-accent)] hover:underline cursor-pointer mt-1"
              >
                + Lägg till nummer
              </button>
            )
          )}
        </div>

        {/* Kundinfo section */}
        <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)] mb-3">
          Kundinfo
        </p>
        <div className="space-y-0">
          <DetailRow label="E-post">
            <InlineEditField
              value={lead.epost ?? ""}
              onSave={(val) => updateLead.mutate({ epost: val })}
              placeholder="Lägg till e-post"
            />
          </DetailRow>
          <DetailRow label="Hemsida">
            <InlineEditField
              value={lead.hemsida ?? ""}
              onSave={(val) => updateLead.mutate({ hemsida: val })}
              placeholder="Lägg till hemsida"
              isLink
            />
          </DetailRow>
          {lead.adress && <ReadOnlyRow label="Adress" value={lead.adress} />}
          {lead.postnummer && <ReadOnlyRow label="Postnr" value={lead.postnummer} />}
          {lead.stad && <ReadOnlyRow label="Stad" value={lead.stad} />}
          {lead.bransch && <ReadOnlyRow label="Bransch" value={lead.bransch} />}
          {lead.omsättning_tkr && <ReadOnlyRow label="Omsättning" value={`${lead.omsättning_tkr} tkr`} />}
          {lead.vd_namn && <ReadOnlyRow label="VD" value={lead.vd_namn} />}
          {lead.orgnr && <ReadOnlyRow label="Org.nr" value={lead.orgnr} mono />}
          {lead.anställda && <ReadOnlyRow label="Anställda" value={lead.anställda} />}
          {lead.vinst_tkr && <ReadOnlyRow label="Vinst" value={`${lead.vinst_tkr} tkr`} />}
          {lead.bolagsform && <ReadOnlyRow label="Bolagsform" value={lead.bolagsform} />}
          {lead.källa && <ReadOnlyRow label="Källa" value={lead.källa} />}
        </div>

        {/* Contacts section */}
        <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)] mt-5 mb-3">
          Kontaktpersoner
        </p>
        <div className="space-y-1.5">
          {(contacts ?? []).length === 0 && !showAddContact && (
            <p className="text-xs text-[var(--color-text-secondary)]">Inga kontaktpersoner.</p>
          )}
          {(contacts ?? []).map((c) => (
            <div key={c.id} className="flex items-center gap-1.5 text-xs text-[var(--color-text-primary)]">
              <span className="font-medium">{c.name}</span>
              {c.role && (
                <>
                  <span className="text-[var(--color-text-secondary)]">—</span>
                  <span className="text-[var(--color-text-secondary)]">{c.role}</span>
                </>
              )}
              {c.phone && (
                <>
                  <span className="text-[var(--color-text-secondary)]">—</span>
                  <span className="font-mono text-[var(--color-text-secondary)]">{formatPhone(c.phone)}</span>
                </>
              )}
            </div>
          ))}

          {/* Add contact inline */}
          {showAddContact ? (
            <div className="flex flex-col gap-1.5 mt-1">
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Namn"
                  className="flex-1 h-7 rounded-md border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-2 text-xs"
                />
                <input
                  type="text"
                  value={contactRole}
                  onChange={(e) => setContactRole(e.target.value)}
                  placeholder="Roll"
                  className="flex-1 h-7 rounded-md border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-2 text-xs"
                />
                <input
                  type="text"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="Telefon"
                  className="flex-1 h-7 rounded-md border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-2 text-xs"
                />
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={handleAddContact}
                  disabled={!contactName.trim() || createContact.isPending}
                  className="rounded-md bg-[var(--color-accent)] px-2.5 py-[3px] text-[11px] font-medium text-white hover:brightness-110 transition-all disabled:opacity-50 cursor-pointer"
                >
                  Spara
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddContact(false);
                    setContactName("");
                    setContactRole("");
                    setContactPhone("");
                  }}
                  className="text-[11px] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] cursor-pointer"
                >
                  Avbryt
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowAddContact(true)}
              className="text-[11px] text-[var(--color-accent)] hover:underline cursor-pointer mt-1"
            >
              + Lägg till kontaktperson
            </button>
          )}
        </div>
      </div>

      {/* Right column: Comments */}
      <div className="p-5">
        <LeadComments leadId={leadId} />
      </div>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline py-2 border-b border-[var(--color-border)] last:border-0">
      <span className="w-24 shrink-0 text-[11px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)]">
        {label}
      </span>
      {children}
    </div>
  );
}

function ReadOnlyRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline py-2 border-b border-[var(--color-border)] last:border-0">
      <span className="w-24 shrink-0 text-[11px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)]">
        {label}
      </span>
      <span className={cn("text-[13px] text-[var(--color-text-primary)]", mono && "font-mono")}>
        {value}
      </span>
    </div>
  );
}
