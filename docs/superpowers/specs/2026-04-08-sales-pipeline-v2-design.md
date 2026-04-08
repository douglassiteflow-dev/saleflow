# Sales Pipeline v2 — Design Spec

## Overview

Pipeline v2 ersatter den befintliga hemsidecentrerade pipelinen (v1) med ett rent saljprocessfokuserat flode. Hemsidegenerering (Flowing AI) triggas automatiskt vid bokning istallet for manuellt av admin. Avtalssystemet porteras fran Pageflow med realtidsspaarning, canvas-signering och PDF-generering.

**Ansats:** Refaktorera befintlig Deal-resurs — byt stages, bygg nya frontend-sidor, ny wizard. Behaall fungerande infrastruktur (audit trail, PubSub, auth, API hooks).

---

## Pipeline-steg

| # | Stage key | Label (UI) | Agare | Trigger |
|---|-----------|------------|-------|---------|
| 1 | `booking_wizard` | Bokning pagaar | Agent | Agent bokar mote i dialern |
| 2 | `demo_scheduled` | Demo schemalagd | System | Wizard slutford, Flowing AI triggered |
| 3 | `meeting_completed` | Mote genomfort | Agent | Agent loggar utfall efter motet |
| 4 | `questionnaire_sent` | Formular skickat | System | Agent skickar formular till kund |
| 5 | `contract_sent` | Avtal skickat | Agent | Agent skickar avtal |
| 6 | `won` | Kund | System | Kund signerar avtal |

Plus `cancelled` som terminal state.

**Regler:**
- Steg kan inte hoppas over (linjart flode)
- `booking_wizard` ar kortlivat — forsvinner sa fort wizarden slutfors
- `demo_scheduled` kan ha flera moten (uppfoljningar)
- `meeting_completed` promptar agenten direkt med utfallsformular
- `contract_sent` kan skickas om vid omforhandling (ny version, samma steg)

---

## Datamodell

### Deal (andrade falt)

| Falt | Andring | Beskrivning |
|------|---------|-------------|
| `stage` | **Byt enum** | `booking_wizard`, `demo_scheduled`, `meeting_completed`, `questionnaire_sent`, `contract_sent`, `won`, `cancelled` |
| `meeting_outcome` | **Nytt**, text nullable | Agentens anteckning om hur motet gick |
| `needs_followup` | **Nytt**, boolean default false | Om uppfoljning behovs |
| `questionnaire_id` | **Nytt**, uuid nullable FK | Koppling till kundformular |
| `contract_id` | **Nytt**, uuid nullable FK | Koppling till avtal |
| `website_url` | Behaall | Demo-lank fran Flowing AI |
| `notes` | Behaall | Agentens kommentarer |
| `domain`, `domain_sponsored` | Behaall | Kundens doman |

**Ta bort:** `contract_url` (ersatts av Contract-relation)

### Questionnaire (ny resurs)

| Falt | Typ | Beskrivning |
|------|-----|-------------|
| `id` | uuid | PK |
| `deal_id` | uuid FK | Koppling till deal |
| `token` | string, unique | Publik URL-token (ingen inloggning) |
| `status` | enum | `pending`, `in_progress`, `completed` |
| `customer_email` | string | Mottagarens email |
| `capacity` | string nullable | "1-10", "10-20" etc. |
| `color_theme` | string nullable | Onskad farg |
| `services_text` | text nullable | Fritext tjanster |
| `services_file_url` | string nullable | Uppladdad tjanstlista |
| `custom_changes` | text nullable | Andringsonskemaal |
| `wants_ads` | boolean nullable | Betalda annonser |
| `most_profitable_service` | string nullable | Mest lonsamma tjanst |
| `wants_quote_generator` | boolean nullable | Offertgenerering pa hemsidan |
| `addon_services` | array of strings | Valda tillaggstjanster |
| `media_urls` | array of strings | Uppladdade bilder/videos |
| `completed_at` | utc_datetime nullable | Nar kunden slutforde |

### QuestionnaireTemplate (ny resurs)

| Falt | Typ | Beskrivning |
|------|-----|-------------|
| `id` | uuid | PK |
| `name` | string | Template-namn |
| `questions` | jsonb | Konfigurerbara fragor och alternativ |
| `is_default` | boolean | Standard-template |

### Contract (portad fran Pageflow)

| Falt | Typ | Beskrivning |
|------|-----|-------------|
| `id` | uuid | PK |
| `deal_id` | uuid FK | Koppling till deal |
| `contract_number` | string | Auto-genererat: "SF-2026-0001" |
| `status` | enum | `draft`, `sent`, `viewed`, `signed`, `superseded` |
| `access_token` | string unique | URL-token for publik aatkomst |
| `verification_code` | string | 6-siffrig kod |
| `recipient_email` | string | Kundens email |
| `recipient_name` | string | Kundens namn |
| `amount` | decimal | Pris |
| `terms` | text | Villkor |
| `currency` | enum | `:SEK` default |
| `customer_signature_url` | string nullable | Canvas-signatur (base64 PNG) |
| `customer_name` | string nullable | Signerat namn |
| `customer_signed_at` | utc_datetime nullable | Signeringstidpunkt |
| `seller_name` | string | Saljaren |
| `seller_signed_at` | utc_datetime | Satt vid skapande |
| `pdf_url` | string nullable | Osignerat avtal PDF |
| `signed_pdf_url` | string nullable | Signerat avtal PDF |
| `last_viewed_page` | string nullable | Senast visade sida |
| `total_view_time` | integer default 0 | Total tid i sekunder |
| `page_views` | map | Per-sektions tid: `{"forsattsblad": 45}` |
| `expires_at` | utc_datetime nullable | Lankens utgang |
| `version` | integer default 1 | Version vid omforhandling |
| `auto_renew` | boolean default false | Auto-fornyelse |
| `renewal_status` | enum | `active`, `pending_renewal`, `renewed`, `cancelled` |
| `renewal_date` | date nullable | Beraknat fornyelsedatum |
| `cancelled_at` | utc_datetime nullable | Uppsagningsdatum |
| `cancellation_end_date` | date nullable | Uppsagningstid slut |
| `custom_fields` | map | Godtycklig data |
| `user_id` | uuid FK | Agenten/saljaren |

### ContractTemplate (portad fran Pageflow)

| Falt | Typ | Beskrivning |
|------|-----|-------------|
| `id` | uuid | PK |
| `name` | string | Template-namn |
| `header_html` | string | Anpassad header |
| `footer_html` | string | Sidfot |
| `terms_html` | string | Villkor-HTML |
| `logo_url` | string | Logotyp |
| `primary_color` | string default "#0f172a" | Temagfarg |
| `font` | string default "Inter" | Typsnitt |
| `is_default` | boolean | Standard-mall |
| `user_id` | uuid FK | Skapare |

### DiscountCode (portad fran Pageflow)

| Falt | Typ | Beskrivning |
|------|-----|-------------|
| `id` | uuid | PK |
| `code` | string unique | Kod (versaler) |
| `type` | enum | `percent`, `fixed_amount` |
| `value` | integer | Varde (25 = 25% eller 500 kr) |
| `valid_from` | date | Giltigt fran |
| `valid_until` | date | Giltigt till |
| `max_uses` | integer nullable | Max anvandningar |
| `current_uses` | integer default 0 | Nuvarande anvandningar |
| `active` | boolean default true | Aktiv |

---

## Wizard vid bokning (ny, byggas om helt)

Wizarden triggas fran dialern nar agent bokar mote. Ersatter befintlig DemoConfig.

### Steg 1: Motesinbjudan

- Kundens namn (fran lead)
- Email (fran lead, redigerbart)
- Datum & tid (datumvaljare + tidvaljare)
- Motestyp: Teams (default)
- Anteckningar (fritext, valfritt)

→ "Nasta" skapar motet och skickar inbjudan

### Steg 2: Konfigurera demo

- Har kunden Bokadirekt?
  - Ja → Klistra in Bokadirekt-lank
  - Nej → Valj alternativ:
    - Befintlig hemsida → Klistra in URL
    - Manuellt → Fyll i foretagsinfo + ladda upp logga

→ "Slutfor" triggar Flowing AI automatiskt i bakgrunden

### UX-detaljer

- Wizard som modal/overlay i dialern (inte ny sida)
- Steg-indikator hogst upp (Steg 1 av 2)
- Validering inline — tydliga felmeddelanden pa svenska
- "Slutfor"-knappen disablas medan Flowing AI triggas, spinner + "Genererar demo..."
- Vid lyckat: deal skapas med stage `demo_scheduled`, wizard stangs, toast "Demo schemalagd for [Foretag]"
- Vid fel: tydligt felmeddelande, mojlighet att forsoka igen

### Bakgrundsprocess

1. Deal skapas med stage `booking_wizard`
2. Meeting skapas och kopplas till deal
3. Flowing AI triggas (scrape → generate → deploy, kedjat)
4. Nar Flowing AI klar → `website_url` sparas pa deal
5. Deal stage → `demo_scheduled`
6. Audit log for varje steg

---

## Kundformular (publik sida)

### Leverans

- Agent klickar "Skicka formular" pa deal-detaljsidan
- System genererar unik token-URL: `siteflow.se/q/{token}`
- Email skickas till kund med lank
- Deal stage → `questionnaire_sent`

### Wizard-steg for kunden

Fristaende sida — ingen navbar, inget login.

**Steg 1 — Kapacitet**
> "Hur manga fler kunder kan du hantera per dag?"
- Radio-knappar: 1-10, 10-20, 20-30, 30-40, 50-100, Obegransat
- Infotext: "Svaret avgor hur starkt vi pushar din hemsida i Google-resultaten"

**Steg 2 — Utseende**
- Fargvaljare / skriv in fargkod
- Valj fargpalett (forhandsvisning)

**Steg 3 — Tjanster**
- Ladda upp tjanstlista (xlsx, pdf) ELLER
- Skriv in i fritext (tjansnamn + pris + beskrivning) ELLER
- Klistra in lank till kalla

**Steg 4 — Media**
- Drag & drop / klicka for att ladda upp bilder och videos
- Forhandsvisning av uppladdade filer

**Steg 5 — Tillaggstjanster**

Varje tjanst visas som kort/checkbox med ikon + namn + saljande tooltip:

| Tjanst | Tooltip |
|--------|---------|
| Professionell foretags-email | "Ge ditt foretag en professionell look med @dittforetag.se — inga fler Gmail-adresser till kunder" |
| Foretagsnummer / Vaxel | "Ett eget foretagsnummer med vidarekoppling, halsningsfras och kohantering" |
| AI-Receptionist | "En AI som svarar i telefon, bokar moten at dig och en chattbubbla pa hemsidan som hjalper kunder dygnet runt" |
| Avancerad SEO | "Hamna hogst pa Google — vi optimerar din hemsida sa att kunderna hittar dig forst" |
| Journalsystem / Journalkoppling | "Digitalt journalsystem integrerat med din hemsida och bokning" |
| Schemalagning & Personal | "Hantera personalscheman, skift och semestrar enkelt i ett system" |
| Bokningssystem | "Lat kunder boka tid direkt via din hemsida — automatiska paminnelser och kalendersynk" |
| Ta betalt online | "Kortbetalning direkt pa hemsidan — Swish, kort, faktura, allt pa ett stalle" |
| Webshop | "Salj produkter online med lagerhantering, frakt och betalning" |
| Betalda annonser | "Marknadsforing via Facebook, Instagram och Snapchat — vi skoter allt at dig" |
| Offertgenerering | "Dina kunder kan begara prisforslag direkt via hemsidan" |

Listan ar konfigurerbar via `QuestionnaireTemplate` (kan lagga till fler tjanster utan koddeploy).

**Steg 6 — Ovrigt**
- "Vilken tjanst tjanar du mest pengar pa?" (fritext)
- "Vill du andra/lagga till nagot specifikt?" (fritext)

**Steg 7 — Klar**
- Sammanfattning av alla svar
- "Skicka" → status `completed`, deal notifieras

### UX-detaljer

- Mobilanpassad (kunder fyller troligen i pa telefon)
- Progress-bar hogst upp
- Autospar — kunden kan stanga och komma tillbaka via samma lank
- Varje steg har "Tillbaka" och "Nasta"
- Validering: inga obligatoriska falt utom kapacitet (steg 1)
- Uppladdning: max 50MB per fil, vanliga bildformat + video + xlsx + pdf
- Tack-sida efter inskick: "Tack! Vi aterkommer nar din hemsida ar redo"

---

## Avtalssystem (portat fran Pageflow)

### Flode

1. Agent klickar "Skicka avtal" pa deal-detaljsidan
2. Formular oppnas: pris, villkor (forifyllt fran template), kundens email
3. Agent justerar pris/villkor → "Skicka"
4. Contract skapas (version 1), email skickas till kund
5. Deal stage → `contract_sent`
6. Kund far email med lank: `siteflow.se/contract/{token}`
7. Kund verifierar med 6-siffrig kod
8. Kund laser avtal — agent ser i realtid vilken sida, hur lange
9. Kund signerar (canvas-signatur)
10. Deal stage → `won`

### Omforhandling

- Kund nekar / vill omforhandla → agent skapar nytt avtal (version+1)
- Gammalt avtal → status `superseded`
- Deal stannar pa `contract_sent`

### Realtidsspaarning (WebSocket)

- Kanal: `contract:{token}`
- IntersectionObserver trackar vilken sektion kunden laser
- Heartbeat var 1:a sekund — tid per sektion
- Flush till DB var 5:e sekund
- Agent ser live: "Kunden laser: Prisoversikt (45s)"

### PDF-generering

- ChromicPDF (HTML → PDF)
- 5 sidor: forsattsblad, tjanstbeskrivning, prisoversikt, villkor, signering
- Anpassningsbart via ContractTemplate (logga, farg, typsnitt, villkor)
- Signerat PDF genereras vid signering med kundens canvas-signatur inbaddad

### Email-notiser

| Trigger | Mottagare | Innehall |
|---------|-----------|----------|
| Avtal skickat | Kund | Lank till avtal + verifieringskod |
| Avtal visat | Agent | "Kunden har oppnat avtalet" |
| Avtal signerat | Agent + admin | "Avtalet ar signerat" |
| Paminnelse (3+ dagar) | Kund | "Du har ett avtal som vantar" |
| Utgar snart (30 dagar) | Agent | "Avtalet gar ut snart" |

### Oban-jobb

| Jobb | Schema | Syfte |
|------|--------|-------|
| `AutoRenewContractsJob` | Dagligen 06:00 | Fornya avtal automatiskt |
| `CheckExpiringContractsJob` | Dagligen | Notifiera om avtal som gar ut |
| `SendContractRemindersJob` | Dagligen 09:00 | Paminn kunder som inte signerat |

### Rabattkoder

- Procent eller fast belopp
- Giltighetsperiod + max anvandningar
- Agent applicerar vid avtalsskapande

---

## Backend API

### Deal endpoints (andrade)

| Metod | Route | Andring |
|-------|-------|---------|
| `GET /api/deals` | Behaall | Nya stages i response |
| `GET /api/deals/:id` | Behaall | Inkludera questionnaire + contract |
| `POST /api/deals/:id/advance` | Behaall | Ny stage-logik |
| `PATCH /api/deals/:id` | Behaall | Nya falt: `meeting_outcome`, `needs_followup` |
| `POST /api/deals/:id/send-questionnaire` | **Ny** | Skapar Questionnaire, skickar email |
| `POST /api/deals/:id/send-contract` | **Ny** | Skapar Contract, skickar email |

### Questionnaire endpoints (nya, publika)

| Metod | Route | Syfte |
|-------|-------|-------|
| `GET /q/:token` | Hamta formulardata + fragor |
| `PATCH /q/:token` | Autospar svar |
| `POST /q/:token/complete` | Markera som slutfort |
| `POST /q/:token/upload` | Ladda upp bilder/filer |

### Contract endpoints (portade fran Pageflow)

| Metod | Route | Auth | Syfte |
|-------|-------|------|-------|
| `GET /api/contracts/:token` | Publik | Hamta avtalsinfo |
| `POST /api/contracts/:token/verify` | Publik | Verifiera 6-siffrig kod |
| `POST /api/contracts/:token/sign` | Publik | Canvas-signering |
| `GET /api/contracts/:token/pdf` | Publik | Ladda ner PDF |
| `PATCH /api/contracts/:token` | Publik | Tracking-data (WebSocket flush) |
| `POST /api/contracts` | Auth | Skapa avtal |
| `POST /api/contracts/:id/send-email` | Auth | Skicka/skicka om |
| `POST /api/contracts/:id/cancel-contract` | Auth | Saga upp avtal |
| `PATCH /api/contracts/:id/toggle-auto-renew` | Auth | Auto-fornyelse |
| `GET /api/contract-templates` | Admin | Lista mallar |
| `POST /api/contract-templates` | Admin | Skapa mall |
| `PATCH /api/contract-templates/:id` | Admin | Redigera mall |
| `GET /api/discount-codes` | Admin | Lista rabattkoder |
| `POST /api/discount-codes` | Admin | Skapa rabattkod |
| `POST /api/contracts/:id/apply-discount` | Auth | Applicera rabattkod |

### Flowing AI (kedjad bakgrundsprocess)

Triggas automatiskt av wizard-completion:
1. `POST /api/admin/deals/:id/scrape` → scrapa foretagsdata
2. `POST /api/admin/deals/:id/generate` → generera hemsida
3. `POST /api/admin/deals/:id/deploy` → deploya, spara `website_url`

### WebSocket-kanaler

| Kanal | Syfte |
|-------|-------|
| `contract:{token}` | **Ny** — realtidsspaarning av avtal |
| `dashboard:updates` | Behaall — deal-andringar |

---

## Frontend

### Admin webapp

**Pipeline-sida (`/pipeline`)** — redesignas
- Listvy grupperad efter 6 nya stages
- Deal-rad: Foretag | Agent | Tid i steget | Status-badge
- Klick → deal-detalj

**Deal-detaljsida (`/pipeline/:id`)** — redesignas
- Stegindikator med 6 steg (horisontell stepper)
- Kontextberoende innehall per steg:
  - `demo_scheduled`: Motesinfo + forhandsgranskning demo-hemsida + "Ga till mote"
  - `meeting_completed`: Utfall, kommentarer, uppfoljningsstatus
  - `questionnaire_sent`: Formularstatus (vantar/pagar/slutfort) + kundens svar
  - `contract_sent`: Realtidsspaarning — vilken sida kunden laser, tid per sektion
  - `won`: Sammanfattning — avtal, hemsida, doman, kund
- Hogerkolumn: Foretagsinfo fran lead
- Moten-lista + audit trail/historik

**Kunder-sida (`/customers`)**
- Deals med stage `won`
- Lista med foretag, agent, avslutsdatum, doman

### Agent Electron-app (dialer)

**Deals-tab** — redesignas
- Agentens aktiva deals med nya stages/badges
- Klick → deal-detalj

**Deal-detalj** — redesignas
- Stegindikator (read-only)
- Demo-lank (prominent, kopiera/oppna)
- Kontextberoende actions:
  - `demo_scheduled`: "Ga till mote" nar datum narmar sig
  - `meeting_completed`: Utfallsformular (hur gick det, uppfoljning, kommentarer)
  - `questionnaire_sent`: "Skicka formular" + status
  - `contract_sent`: "Skicka avtal" + live-spaarning
- Moten-lista

**Ny wizard-modal** — byggas om helt
- Ersatter befintlig DemoConfig
- Steg 1: Motesinbjudan
- Steg 2: Demo-config → Flowing AI auto-trigger

### Kundformular (`siteflow.se/q/{token}`)

- Fristaende publik sida
- Wizard med 7 steg
- Mobilanpassad, progress-bar, autospar
- Tillaggstjanster med saljande tooltips
- Tack-sida efter inskick

### Avtalssida (`siteflow.se/contract/{token}`)

- Fristaende publik sida (portad fran Pageflow)
- 6-siffrig kodverifiering
- Interaktivt avtal med sektioner
- Canvas-signatur
- Realtidsspaarning via WebSocket
- Tack-sida + PDF-nedladdning

---

## Utanfor scope

- BankID-signering (canvas racker)
- Transkribering/AI coach vid motesinspelning
- Migration av befintliga v1-deals (separat fas)
- Konfigurerbar pipeline (fas 3)
- Multi-tenant / SaaS

---

## Kvalitetskrav

- 100% test coverage — backend (ExUnit) och frontend (Vitest)
- Inga test-skips
- Full audit trail — alla mutationer pa Deal, Questionnaire, Contract loggas
- DRY — ingen duplicerad kod
- Alla sidor matchar dashboardens design (sizing, typsnitt, farger, spacing)
- Svenska i all UI-text
- Mobilanpassat kundformular + avtalssida
- Anvandardvanligt UX genomgaende
