# Dialer Kundmodal — Design Spec

## Översikt

Ersätter den befintliga call-modal + lead-detail-tab med en fullständig **kundmodal** som öppnas vid "Ring kund" och inte kan stängas utan utfall. Modalen visar all kundinformation, kommentarer, samtalshistorik med inspelningar, och redigerbara fält (e-post, hemsida). Agenten kan lägga till nya telefonnummer och ringa dem inom samma modal.

---

## Flöde

```
Agent klickar "Ring kund"
    ↓
Kundmodal öppnas (kan ej stängas utan utfall)
    ↓
Samtal pågår — timer visar tid, "Lägg på"-knapp
    ↓
Agent kan:
  • Se all kundinfo
  • Redigera e-post och hemsida (klicka → input → Enter sparar)
  • Lägga till nytt telefonnummer → ringa det
  • Lägga till kontaktpersoner
  • Skriva kommentarer
  • Byta till Historik-tab → se tidigare samtal + inspelningar
  • Öppna snabblänkar (Google, Maps, Allabolag, Eniro)
    ↓
Agent väljer utfall (Möte bokat / Återringning / Ej intresserad / etc.)
    ↓
Modal stängs → nästa kund
```

---

## Modal — Layout

### Header
Gradient bakgrund (`linear-gradient(135deg, #312E81, #4F46E5, #6366F1)`) — matchar dialer-headern.
- Företagsnamn (18px, bold, vit)
- Undertext: bransch · adress · org.nr (12px, vit 70%)

### Samtalsfält
Under headern, `var(--color-bg-panel)` bakgrund.
- Röd pulserande punkt (animation) medan samtal pågår
- Telefonnummer (JetBrains Mono, 14px)
- Timer MM:SS (JetBrains Mono, 20px, light)
- "Pågående samtal" text
- "Lägg på"-knapp (röd, högerställd)

### Snabblänkar
Rad med knappar, samma styling som `lead-detail-tab.tsx`:
- Google ↗ (söker företag + stad)
- Maps ↗ (Google Maps med adress)
- Allabolag ↗ (org.nr eller företagsnamn)
- Eniro ↗ (företagssökning)

Styling: `border border-[var(--color-border)] px-2 py-[3px] text-[11px]`

### Tabs
Två tabs under snabblänkarna:
- **Kundinfo** (default aktiv)
- **Historik** med badge som visar antal tidigare samtal (t.ex. "3")

Tab-styling matchar dialer-tabs: `text-[13px] font-medium`, aktiv tab med `var(--color-accent)` underline.

### Utfallsknappar
Alltid synliga längst ner i modalen oavsett aktiv tab. 6 knappar i en rad:
- Möte bokat (emerald)
- Återringning (amber)
- Ej intresserad (rose)
- Ej svar (slate)
- Ring senare (blue)
- Fel nummer (red)

Styling matchar `call-modal.tsx` exakt: `border-{color}-300 bg-{color}-50 text-{color}-700`

Att klicka utfall → stänger modalen → systemet går vidare till nästa kund.

### Footer
`text-[10px]` med "Stängs bara via utfall" och importdatum/källa.

---

## Tab 1: Kundinfo

Tvåkolumn-layout (`grid grid-cols-2`).

### Vänster kolumn: Data

**Telefonnummer-sektion:**
- Lista med telefonnummer, varje med:
  - Nummer (JetBrains Mono, 13px)
  - "Ring"-knapp (`var(--color-success)`) eller "● Pågår" om aktivt samtal
  - Tag (Huvud / Tillagd)
- "Lägg till nummer" — klickar → inline input → Enter sparar, nummer får Ring-knapp

**Kundinfo-sektion:**
DetailRow-mönster från lead-detail-tab (label vänster, värde höger):

| Fält | Redigerbart | Klickbart |
|------|-------------|-----------|
| E-post | ✅ Klicka → input → Enter sparar | — |
| Hemsida | ✅ Klicka → input → Enter sparar | Öppnar i ny flik (↗) |
| Adress | — | — |
| Postnr | — | — |
| Stad | — | — |
| Bransch | — | — |
| Omsättning | — | — |
| VD | — | — |
| Org.nr | — (monospace) | — |
| Anställda | — | — |
| Vinst | — | — |
| Bolagsform | — | — |
| Källa | — | — |

**Redigerbart beteende:**
- Hover: lätt lila bakgrund (`#EEF2FF`) + border (`#C7D2FE`)
- Klick: span döljs, input visas med focus + `var(--color-accent)` border + box-shadow
- Enter/blur: sparar, grön flash-animation
- Escape: avbryter

**Kontaktpersoner-sektion:**
- Lista med kontaktpersoner (namn — roll — nummer)
- "Lägg till kontaktperson" — inline formulär

### Höger kolumn: Kommentarer

- Scrollbar lista med kommentarer (nyaste överst)
- Varje kommentar: agent-namn, datum, text
- Textarea för ny kommentar
- Enter/knapp skickar kommentaren

---

## Tab 2: Historik

Fullbredd (ingen tvåkolumn-layout).

Varje historik-post visar:
- **Datum + tid** (13px, medium)
- **Utfall-badge** (samma färger som utfallsknappar)
- **Agent-namn** (11px, bold) + telefonnummer + samtalstid (JetBrains Mono)
- **"▶ Spela upp inspelning (3:21)"** — om inspelning finns. Styling: lila bakgrund (`#EEF2FF`), border (`#C7D2FE`), `var(--color-accent)` text
- **Anteckning** — bakgrund `var(--color-bg-panel)`, border, rounded

Historik-badge i tab-headern visar antal poster.

---

## Backend-ändringar

### Lead-resurs: Utöka `update_fields`

Nuvarande `update_fields` action accepterar bara `telefon_2`. Utöka till:
- `epost`
- `hemsida`
- `telefon_2` (befintlig)

Nya telefonnummer hanteras via `telefon_2` eller ny kontaktpersoner-modell (se nedan).

### Nytt: Kontaktpersoner (enkel modell)

| Fält | Typ |
|------|-----|
| id | uuid |
| lead_id | uuid FK |
| name | string |
| role | string, nullable |
| phone | string, nullable |
| email | string, nullable |

Endpoint: `POST /api/leads/:id/contacts`, `GET /api/leads/:id/contacts`

### Ändrad endpoint: Lead show

`GET /api/leads/:id` utökas med:
- `contacts` — lista med kontaktpersoner
- `call_history` — lista med samtalsloggar inkl. inspelnings-status

### Ny komponent-endpoint (om ej redan finns)

Inspelning hämtas via befintlig `useRecordingUrl` hook — ingen ny endpoint behövs.

---

## Frontend-ändringar

### Ny komponent: `customer-modal.tsx`

Ersätter nuvarande `call-modal.tsx` som primär vy under samtal. Stor modal (920px bred) med:
- Header med gradient
- Samtalsfält med timer
- Snabblänkar
- Tabs (Kundinfo / Historik)
- Utfallsknappar (alltid synliga)

### Redigerbara fält: `inline-edit-field.tsx`

Generisk komponent:
```
<InlineEditField
  value={lead.epost}
  onSave={(val) => updateLead({ epost: val })}
  type="email"
/>
```

### Historik-vy: `call-history-list.tsx`

Listar samtalsloggar med inspelning-knappar. Använder befintlig `RecordingPlayer` komponent.

### Dialer-integration

- "Ring kund" → öppnar CustomerModal istället för call-modal
- Modal kan inte stängas (ingen X-knapp, inget Escape, inget klick utanför)
- Utfall → stänger modal → `submitOutcome` → nästa lead

---

## Borttaget / Utanför scope

- Redigering av adress, bransch, VD, omsättning, org.nr, anställda, vinst, bolagsform
- Manuell lead-skapning
- Massredigering
- Admin-redigering av leads

---

## Kvalitetskrav

- 100% test coverage — backend (ExUnit) och frontend (Vitest)
- Inga test-skips
- DRY — ingen duplicerad kod
- Matchar dashboardens design tokens (sizing, typsnitt, färger, spacing)
- Svenska (ÅÄÖ) i all UI-text
