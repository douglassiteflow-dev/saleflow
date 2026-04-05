# Deal Pipeline — Design Spec

## Overview

Saleflow saknar idag ett flöde efter att ett möte bokats. Denna spec definierar en **Deal-pipeline** — ett fast flöde med 9 steg som tar en kund från bokat möte till lanserad hemsida och signerat avtal.

**Fas 1:** Internt verktyg med fast flöde.
**Fas 2 (framtid):** Konfigurerbar pipeline, SaaS med betalda appar.

---

## Plattformar

- **Admin** = webapp i webbläsare (driver pipeline, konfigurerar hemsidor, DNS)
- **Agent/Säljare** = Electron desktop-app (dialer, deals, kundvy, skickar avtal)

---

## Pipeline-steg (fast flöde)

| # | Stage | Ägare | Automatiskt | Beskrivning |
|---|-------|-------|-------------|-------------|
| 1 | `meeting_booked` | System | ✅ Microsoft-inbjudan | Deal skapas, inbjudan skickas |
| 2 | `needs_website` | Admin | — | Admin konfigurerar data för Flowing AI |
| 3 | `generating_website` | System | ✅ Flowing AI triggas | Hemsida genereras |
| 4 | `reviewing` | Admin | — | Admin granskar resultat |
| 5 | `deployed` | Admin | — | Admin deployar, demo-länk till agent |
| 6 | `demo_followup` | Agent | — | ⏸ Agent har demo, uppföljningar, flera möten. Skickar avtal när kund vill köpa |
| 7 | `contract_sent` | System | — | Väntar på signering |
| 8 | `signed` | System | ✅ Kund signerar | Deal klar |
| 9 | `dns_launch` | Admin | — | Pekar domän (kundens egen eller sponsored 12 mån) |
| ✓ | `won` | — | — | Deal avslutad, kund övergår till förvaltning |

**Regler:**
- Steg kan inte hoppas över
- Vid steg 6 pausar pipelinen — agent kan boka flera möten och uppföljningar
- Agent triggar steg 7 (skickar avtal) själv via Electron-appen
- Efter `won` övergår kunden till kundförvaltning med fortsatta möten

---

## Datamodell

### Deal (ny resurs)

| Fält | Typ | Beskrivning |
|------|-----|-------------|
| id | uuid | PK |
| lead_id | uuid | FK → Lead (1:1 aktiv deal per lead) |
| user_id | uuid | FK → User (agenten som äger dealen) |
| stage | enum | Se pipeline-steg ovan |
| website_url | string, nullable | Demo-länk från Flowing AI |
| contract_url | string, nullable | SignFlow-länk |
| domain | string, nullable | Kundens domän |
| domain_sponsored | boolean, default false | Om ni bjuder på domänen |
| notes | text, nullable | Anteckningar |
| inserted_at | utc_datetime | |
| updated_at | utc_datetime | |

**Relationer:**
- Deal belongs_to Lead
- Deal belongs_to User
- Deal has_many Meetings (via nytt `deal_id` på Meeting)

### Meeting (ändring)

| Fält | Typ | Beskrivning |
|------|-----|-------------|
| deal_id | uuid, nullable | FK → Deal |

### Contract (platshållare — designas separat)

| Fält | Typ | Beskrivning |
|------|-----|-------------|
| id | uuid | PK |
| deal_id | uuid | FK → Deal |
| recipient_email | string | |
| recipient_name | string | |
| status | enum | :draft, :sent, :signed, :declined |
| signed_at | utc_datetime, nullable | |
| document_url | string, nullable | |

> SignFlow-integration kopieras från Pageflow och designas i separat spec.

---

## Backend — Nya endpoints

### Deal endpoints

| Metod | Route | Syfte |
|-------|-------|-------|
| GET | `/api/deals` | Lista deals (agent: egna, admin: alla) |
| GET | `/api/deals/:id` | Deal-detalj med lead, möten, historik |
| POST | `/api/deals/:id/advance` | Flytta deal till nästa steg |
| PATCH | `/api/deals/:id` | Uppdatera fält (notes, domain, etc.) |

### Flowing AI proxy-endpoints

| Metod | Route | Syfte |
|-------|-------|-------|
| POST | `/api/deals/:id/scrape` | Skicka bokadirekt-URL till Flowing AI |
| GET | `/api/deals/:id/scrape-result` | Hämta bilder + tjänster för val |
| POST | `/api/deals/:id/generate` | Trigga generering med valda bilder/tjänster |
| GET | `/api/deals/:id/generate-logs` | Proxar SSE-loggar från Flowing AI |
| POST | `/api/deals/:id/deploy` | Trigga deploy, spara URL på deal |

**Proxy-motivering:**
- Auth — bara inloggade admins kan trigga
- Deal uppdateras automatiskt (stage, website_url)
- Audit trail — allt loggas
- Flowing AI behöver inte veta om Saleflow-koncepten

### Automatisk Deal-skapelse

När ett möte bokas (via `POST /api/leads/:id/outcome` med outcome `meeting_booked`):
1. Om lead inte har en aktiv deal → skapa Deal med stage `meeting_booked`
2. Koppla mötet till dealen (`deal_id`)
3. Om lead redan har en aktiv deal → koppla mötet till befintlig deal

---

## Frontend — Admin webapp

### Pipeline-sida (`/pipeline`)

- **Sidtitel + filter** (per agent, datumintervall)
- **Listvy med sektioner** — varje steg är en sektion med deals som rader
- Sektioner utan deals kollapsar
- Antal deals per sektion: "Behöver hemsida (3)"

**Deal-rad:**
```
[Företagsnamn]  [Agent]  [Tid i steget]  [Nästa action-knapp]
```

**Action-knappar per steg:**

| Steg | Knapp |
|------|-------|
| meeting_booked | → Gå till deal |
| needs_website | Konfigurera & Generera |
| generating_website | ⏳ Spinner |
| reviewing | Visa hemsida / Deploya |
| deployed | ✓ Markera skickad |
| demo_followup | — (agent driver) |
| contract_sent | — (väntar) |
| signed | Starta DNS |
| dns_launch | Markera klar |

### Deal-detaljsida (`/pipeline/:id`)

**Tvåkolumn-layout:**

**Vänster kolumn — Deal-info:**
- Stegindikator — horisontell stepper genom alla steg
- Actions-sektion beroende på aktuellt steg:
  - `needs_website`: Formulär — bokadirekt-URL, välj bilder/tjänster
  - `generating_website`: Realtidslogg via SSE
  - `reviewing`: Förhandsgranska hemsida + Godkänn/Deploya-knapp
  - `deployed`: Bekräftelse att demo-länk skickats
  - `signed`: DNS-konfigurationsformulär (domän, sponsored)
- Möten — lista på alla möten kopplade till dealen
- Avtal — status (när SignFlow implementeras)
- Historik/tidslinje

**Höger kolumn — Företagsinfo (från Lead):**
- Företag, telefon, epost, adress, bransch, orgnr
- VD, omsättning, anställda
- Agent
- Kartlänk

### Kunder-sida (`/customers`)

- Deals med stage `won`
- Lista med företag, agent, avslutsdatum, domän
- Klick → kunddetalj

### Kund-detaljsida (`/customers/:id`)

- Samma layout som deal-detalj men med kundförvaltningsfokus
- Hemsida, avtal, domän, möten, uppföljningar

---

## Frontend — Agent Electron-app

### Ny tab "Deals" i dialern

**Lista:**
- Agentens aktiva deals sorterade med viktigaste överst
- Rad: `[Företag]  [Status-badge]  [Senaste aktivitet]`
- Status-badge i klartext: "Demo-länk redo", "Väntar på hemsida", "Avtal signerat"

**Deal-detalj (klick på rad):**
- Stegindikator (read-only)
- Demo-länk — prominent, lätt att kopiera/öppna
- Möten — lista + boka nytt uppföljningsmöte
- Skicka avtal — knapp vid `demo_followup`-steget
- Företagsinfo

### Ny tab "Kunder" i dialern

- Deals med stage `won`
- Lista med möjlighet att boka uppföljningsmöten
- Se avtal, hemsida, domän

### Ändringar i befintlig dialer

- `OutcomeInline` → "Meeting Booked" skapar Deal automatiskt
- `MeetingBookingModal` → om deal finns, kopplar mötet till den
- Tabs-raden: +2 tabs ("Deals", "Kunder")

---

## Flowing AI-integration (teknisk detalj)

**Flowing AI API (localhost:1337):**

| Saleflow anropar | Flowing AI endpoint | Syfte |
|------------------|---------------------|-------|
| `POST /api/deals/:id/scrape` | `POST /api/scrape` | Scrapa företagsdata |
| `GET /api/deals/:id/scrape-result` | (sparad data) | Visa bilder + tjänster |
| `POST /api/deals/:id/generate` | `POST /api/generate` | Starta generering |
| `GET /api/deals/:id/generate-logs` | `GET /api/generate/:slug/logs` | SSE-loggström |
| `POST /api/deals/:id/deploy` | `POST /api/deploy/:slug` | Deploya till Vercel |

**Data som skickas till Flowing AI:**
```json
{
  "slug": "företagsnamn-från-lead",
  "selectedImages": ["img1.jpg", "img2.jpg"],
  "selectedServices": [0, 2, 4]
}
```

**Data tillbaka:**
- Generering: status via SSE, slutstatus "done"/"error"
- Deploy: `{ "url": "https://slug.vercel.app" }` → sparas som `website_url` på deal

---

## Utanför scope

- Konfigurerbar pipeline (fas 2)
- Multi-tenant / SaaS / betalningar
- Detaljerad SignFlow-design (separat spec, kopieras från Pageflow)
- App store-konfiguration av pipeline-triggers

---

## Kvalitetskrav

- 100% test coverage — backend (ExUnit) och frontend (Vitest + Playwright)
- Inga test-skips
- Parallella valideringar
- DRY — ingen duplicerad kod
- Best practices genomgående
- Alla sidor matchar dashboardens design (sizing, typsnitt, färger, spacing)
- Svenska (ÅÄÖ) i all UI-text
